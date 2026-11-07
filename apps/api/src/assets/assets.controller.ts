import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  assetStatusSchema,
  AssetStatusInput,
  assignAssetSchema,
  AssignAssetInput,
  createAssetSchema,
  CreateAssetInput,
  listAssetsQuerySchema,
  ListAssetsQuery,
  returnAssetSchema,
  ReturnAssetInput,
  updateAssetSchema,
  UpdateAssetInput,
} from '@hrms/shared';
import { RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AssetsService } from './assets.service';

@Controller()
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get('assets')
  @RequirePermissions('asset.manage')
  list(@Query(new ZodPipe(listAssetsQuerySchema)) q: ListAssetsQuery) {
    return this.assets.list(q);
  }

  @Post('assets')
  @RequirePermissions('asset.manage')
  create(@Body(new ZodPipe(createAssetSchema)) body: CreateAssetInput) {
    return this.assets.create(body);
  }

  @Get('assets/:id')
  @RequirePermissions('asset.manage')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.assets.get(id);
  }

  @Patch('assets/:id')
  @RequirePermissions('asset.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateAssetSchema)) body: UpdateAssetInput,
  ) {
    return this.assets.update(id, body);
  }

  @Post('assets/:id/assign')
  @RequirePermissions('asset.manage')
  @HttpCode(200)
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(assignAssetSchema)) body: AssignAssetInput,
  ) {
    return this.assets.assign(id, body);
  }

  @Post('assets/:id/return')
  @RequirePermissions('asset.manage')
  @HttpCode(200)
  returnAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(returnAssetSchema)) body: ReturnAssetInput,
  ) {
    return this.assets.returnAsset(id, body);
  }

  @Post('assets/:id/status')
  @RequirePermissions('asset.manage')
  @HttpCode(200)
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(assetStatusSchema)) body: AssetStatusInput,
  ) {
    return this.assets.setStatus(id, body);
  }

  /** Assets a person holds, for their profile. */
  @Get('employees/:id/assets')
  heldBy(@Param('id', ParseUUIDPipe) id: string) {
    return this.assets.heldBy(id);
  }
}
