import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  CreateFolderInput,
  DOCUMENT_MIME_TYPES,
  ListDocumentsQuery,
  MAX_DOCUMENT_BYTES,
  UpdateDocumentInput,
  UploadDocumentInput,
} from '@hrms/shared';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { currentContext, requireTenantId } from '../common/request-context';
import { EmployeeAccess } from '../employees/employee-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentStorage } from './document-storage';

/** Folders every workspace starts with; HR can add more. */
const DEFAULT_FOLDERS: { name: string; visibility: 'EVERYONE' | 'HR' }[] = [
  { name: 'Company policies', visibility: 'EVERYONE' },
  { name: 'Payroll & tax', visibility: 'HR' },
  { name: 'Compliance', visibility: 'HR' },
  { name: 'Contracts', visibility: 'HR' },
  { name: 'Templates', visibility: 'HR' },
];

/** First bytes of the formats we can recognise, so a renamed file can't pose as a PDF or image. */
const MAGIC: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  // docx and xlsx are zip files.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [[0x50, 0x4b]],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4b]],
};

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const documentSelect = {
  id: true,
  name: true,
  category: true,
  mimeType: true,
  size: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  uploadedById: true,
  employeeId: true,
  folderId: true,
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      department: { select: { id: true, name: true } },
    },
  },
  folder: { select: { id: true, name: true, visibility: true } },
} satisfies Prisma.DocumentSelect;

/**
 * Who can do what with documents:
 * - `document.read`: read every employee's files and every folder.
 * - `document.manage`: upload anywhere, verify, rename, delete, add folders.
 * - Everyone: read and upload their own files (uploads wait for HR review), delete their own
 *   files while still waiting for review, and read folders marked for everyone.
 * Managers do not see their team's files: ID copies stay between the person and HR.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EmployeeAccess,
    private readonly storage: DocumentStorage,
    private readonly audit: AuditService,
  ) {}

  async folders() {
    await this.ensureDefaultFolders();
    const hr = this.access.can('document.read');
    const self = await this.access.selfEmployeeId();
    const folders = await this.prisma.db.documentFolder.findMany({
      where: hr ? {} : { visibility: 'EVERYONE' },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        visibility: true,
        _count: { select: { documents: { where: { deletedAt: null } } } },
      },
    });
    const live = { deletedAt: null };
    const employeeFiles = hr
      ? await this.prisma.db.document.count({ where: { ...live, employeeId: { not: null } } })
      : self
        ? await this.prisma.db.document.count({ where: { ...live, employeeId: self } })
        : 0;
    let byDepartment: { id: string | null; name: string; count: number }[] = [];
    if (hr) {
      const rows = await this.prisma.$queryRaw<
        { id: string | null; name: string | null; count: bigint }[]
      >`
        SELECT d.id, d.name, COUNT(doc.id) AS count
        FROM "Document" doc
        JOIN "Employee" e ON e.id = doc."employeeId" AND e."tenantId" = ${requireTenantId()}::uuid
        LEFT JOIN "Department" d ON d.id = e."departmentId"
        WHERE doc."tenantId" = ${requireTenantId()}::uuid AND doc."deletedAt" IS NULL
        GROUP BY d.id, d.name
        ORDER BY d.name NULLS LAST`;
      byDepartment = rows.map((r) => ({
        id: r.id,
        name: r.name ?? 'No department',
        count: Number(r.count),
      }));
    }
    const all = await this.prisma.db.document.count({ where: this.visibleWhere(hr, self) });
    return {
      all,
      employeeFiles,
      byDepartment,
      folders: folders.map((f) => ({
        id: f.id,
        name: f.name,
        visibility: f.visibility,
        count: f._count.documents,
      })),
      canManage: this.access.can('document.manage'),
      selfEmployeeId: self,
    };
  }

  async createFolder(input: CreateFolderInput) {
    const folder = await this.prisma.db.documentFolder.create({
      data: input as Prisma.DocumentFolderUncheckedCreateInput,
    });
    await this.audit.record('document.folder_created', 'DocumentFolder', folder.id, {
      name: folder.name,
    });
    return folder;
  }

  async list(q: ListDocumentsQuery) {
    const hr = this.access.can('document.read');
    const self = await this.access.selfEmployeeId();
    const where: Prisma.DocumentWhereInput = { AND: [this.visibleWhere(hr, self)] };
    const and = where.AND as Prisma.DocumentWhereInput[];

    if (q.employeeId) {
      await this.assertCanReadEmployee(q.employeeId);
      and.push({ employeeId: q.employeeId });
    }
    if (q.folderId) {
      await this.folderFor('read', q.folderId);
      and.push({ folderId: q.folderId });
    }
    if (q.departmentId) and.push({ employee: { departmentId: q.departmentId } });
    if (q.status) and.push({ status: q.status });
    if (q.search) {
      const contains = { contains: q.search, mode: 'insensitive' as const };
      and.push({
        OR: [
          { name: contains },
          { category: contains },
          { employee: { firstName: contains } },
          { employee: { lastName: contains } },
          { employee: { employeeCode: contains } },
        ],
      });
    }

    const [items, total] = await Promise.all([
      this.prisma.db.document.findMany({
        where,
        select: documentSelect,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.db.document.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async upload(file: UploadedFile | undefined, input: UploadDocumentInput) {
    if (!file) throw new BadRequestException('Attach a file');
    if (file.size > MAX_DOCUMENT_BYTES)
      throw new PayloadTooLargeException('Files can be up to 20 MB');
    if (file.size === 0) throw new BadRequestException('That file is empty');
    this.assertFileType(file);

    const manage = this.access.can('document.manage');
    if (input.employeeId) {
      const isSelf = await this.access.isSelf(input.employeeId);
      if (!manage && !isSelf) {
        if (await this.canReadEmployee(input.employeeId))
          throw new ForbiddenException('You can view but not add files for this person');
        throw new NotFoundException('Employee not found');
      }
      const exists = await this.prisma.db.employee.findUnique({
        where: { id: input.employeeId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Employee not found');
    } else if (input.folderId) {
      await this.folderFor('write', input.folderId);
    }

    const tenantId = requireTenantId();
    const id = randomUUID();
    const storageKey = await this.storage.put(tenantId, id, file.buffer);
    try {
      const doc = await this.prisma.db.document.create({
        data: {
          id,
          employeeId: input.employeeId ?? null,
          folderId: input.folderId ?? null,
          name: cleanName(input.name ?? file.originalname),
          category: input.category,
          mimeType: file.mimetype,
          size: file.size,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          storageKey,
          // HR uploads are trusted; anything else waits for HR to check it.
          status: manage ? 'VERIFIED' : 'NEEDS_REVIEW',
          uploadedById: currentContext().userId ?? null,
        } as Prisma.DocumentUncheckedCreateInput,
        select: documentSelect,
      });
      await this.audit.record('document.uploaded', 'Document', id, {
        employeeId: doc.employeeId,
        folderId: doc.folderId,
        category: doc.category,
        size: doc.size,
      });
      return doc;
    } catch (err) {
      await this.storage.remove(storageKey);
      throw err;
    }
  }

  async get(id: string) {
    const doc = await this.prisma.db.document.findFirst({
      where: { id, deletedAt: null },
      select: { ...documentSelect, storageKey: true },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.employeeId) await this.assertCanReadEmployee(doc.employeeId, 'Document not found');
    else if (doc.folderId) await this.folderFor('read', doc.folderId, 'Document not found');
    return doc;
  }

  async download(id: string) {
    const doc = await this.get(id);
    const data = await this.storage.get(requireTenantId(), doc.id, doc.storageKey);
    // Employee files can hold ID numbers, so every read of one is logged.
    if (doc.employeeId)
      await this.audit.record('document.downloaded', 'Document', doc.id, {
        employeeId: doc.employeeId,
      });
    return { doc, data };
  }

  async update(id: string, input: UpdateDocumentInput) {
    await this.get(id);
    const doc = await this.prisma.db.document.update({
      where: { id },
      data: { ...input, ...(input.name ? { name: cleanName(input.name) } : {}) },
      select: documentSelect,
    });
    await this.audit.record('document.updated', 'Document', id, {
      fields: Object.keys(input),
      status: input.status,
    });
    return doc;
  }

  async remove(id: string) {
    const doc = await this.get(id);
    const manage = this.access.can('document.manage');
    const ownPending =
      doc.employeeId !== null &&
      doc.status === 'NEEDS_REVIEW' &&
      doc.uploadedById === currentContext().userId &&
      (await this.access.isSelf(doc.employeeId));
    if (!manage && !ownPending) throw new ForbiddenException('Ask HR to remove this document');
    await this.prisma.db.document.update({ where: { id }, data: { deletedAt: new Date() } });
    // The bytes go now; the row stays (without content) so the audit trail still points somewhere.
    await this.storage.remove(doc.storageKey);
    await this.audit.record('document.deleted', 'Document', id, {
      employeeId: doc.employeeId,
      folderId: doc.folderId,
    });
  }

  private visibleWhere(hr: boolean, self: string | null): Prisma.DocumentWhereInput {
    if (hr) return { deletedAt: null };
    return {
      deletedAt: null,
      OR: [
        ...(self ? [{ employeeId: self }] : []),
        { folder: { visibility: 'EVERYONE' as const } },
      ],
    };
  }

  private async canReadEmployee(employeeId: string) {
    return this.access.can('document.read') || (await this.access.isSelf(employeeId));
  }

  private async assertCanReadEmployee(employeeId: string, message = 'Employee not found') {
    if (!(await this.canReadEmployee(employeeId))) throw new NotFoundException(message);
  }

  private async folderFor(mode: 'read' | 'write', folderId: string, message = 'Folder not found') {
    const folder = await this.prisma.db.documentFolder.findUnique({ where: { id: folderId } });
    if (!folder) throw new NotFoundException(message);
    const canRead = folder.visibility === 'EVERYONE' || this.access.can('document.read');
    if (!canRead) throw new NotFoundException(message);
    if (mode === 'write' && !this.access.can('document.manage'))
      throw new ForbiddenException('Only HR can add files to company folders');
    return folder;
  }

  private assertFileType(file: UploadedFile) {
    const extensions = DOCUMENT_MIME_TYPES[file.mimetype];
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (!extensions || !extensions.includes(ext))
      throw new BadRequestException('Upload a PDF, image, Word, Excel or CSV file');
    const signatures = MAGIC[file.mimetype];
    if (signatures && !signatures.some((sig) => sig.every((b, i) => file.buffer[i] === b)))
      throw new BadRequestException('That file does not look like a real ' + ext.toUpperCase());
  }

  private async ensureDefaultFolders() {
    if (await this.prisma.db.documentFolder.count()) return;
    await this.prisma.db.documentFolder.createMany({
      data: DEFAULT_FOLDERS as Prisma.DocumentFolderCreateManyInput[],
      skipDuplicates: true,
    });
  }
}

/** Keeps a display name safe for headers and file systems. */
function cleanName(name: string) {
  return (
    name
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160) || 'document'
  );
}
