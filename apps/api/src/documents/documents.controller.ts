import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  createFolderSchema,
  CreateFolderInput,
  listDocumentsQuerySchema,
  ListDocumentsQuery,
  MAX_DOCUMENT_BYTES,
  updateDocumentSchema,
  UpdateDocumentInput,
  uploadDocumentSchema,
  UploadDocumentInput,
} from '@hrms/shared';
import type { Response } from 'express';
import { RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { DocumentsService, type UploadedFile as File } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /** Folder tree with counts, limited to what the caller may see. */
  @Get('folders')
  folders() {
    return this.documents.folders();
  }

  @Post('folders')
  @RequirePermissions('document.manage')
  createFolder(@Body(new ZodPipe(createFolderSchema)) body: CreateFolderInput) {
    return this.documents.createFolder(body);
  }

  @Get()
  list(@Query(new ZodPipe(listDocumentsQuerySchema)) query: ListDocumentsQuery) {
    return this.documents.list(query);
  }

  /** Multipart form: `file` plus `employeeId` or `folderId`, `category` and optional `name`. */
  @Post()
  @UseInterceptors(
    // Allow one byte over the limit so the service can answer with a clear "too large".
    FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES + 1, files: 1 } }),
  )
  upload(
    @UploadedFile() file: File | undefined,
    @Body(new ZodPipe(uploadDocumentSchema)) body: UploadDocumentInput,
  ) {
    return this.documents.upload(file, body);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.documents.get(id).then(({ storageKey: _key, ...doc }) => doc);
  }

  /** The decrypted file. `?inline=1` shows it in the browser instead of saving it. */
  @Get(':id/file')
  async file(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('inline') inline: string | undefined,
    @Res() res: Response,
  ) {
    const { doc, data } = await this.documents.download(id);
    const disposition = inline === '1' ? 'inline' : 'attachment';
    res.set({
      'Content-Type': doc.mimeType,
      'Content-Length': String(data.length),
      'Content-Disposition': `${disposition}; filename="${asciiName(doc.name)}"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      'Cache-Control': 'private, no-store',
      // Uploaded files must never run as part of the app.
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    });
    res.end(data);
  }

  @Patch(':id')
  @RequirePermissions('document.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateDocumentSchema)) body: UpdateDocumentInput,
  ) {
    return this.documents.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.documents.remove(id);
  }
}

const asciiName = (name: string) => name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
