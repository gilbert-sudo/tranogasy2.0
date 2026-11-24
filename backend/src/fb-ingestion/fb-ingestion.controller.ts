import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FbAdminGuard, verifyOptionalAdminSecretHeader } from './fb-admin.guard';
import { FbGcsService } from './fb-gcs.service';
import { FbIngestionService } from './fb-ingestion.service';

@Controller('api/fb-ingestion')
export class FbIngestionAuthController {
  constructor(
    private readonly fbIngestionService: FbIngestionService,
    private readonly configService: ConfigService,
  ) {}

  @Post('admin-login')
  adminLogin(
    @Headers('x-admin-secret') adminSecret: string | undefined,
    @Body() body: { identifier: string; password: string },
  ) {
    verifyOptionalAdminSecretHeader(this.configService, adminSecret);
    return this.fbIngestionService.adminLogin(body?.identifier, body?.password);
  }
}

@Controller('api/fb-ingestion')
@UseGuards(FbAdminGuard)
export class FbIngestionController {
  constructor(
    private readonly fbIngestionService: FbIngestionService,
    private readonly fbGcsService: FbGcsService,
  ) {}

  @Get('admin-me')
  getAdminMe(@Req() req: { adminUser?: Record<string, any> }) {
    return { user: req.adminUser || null };
  }

  @Post('upload-image')
  uploadAdminImage(
    @Body()
    body: {
      dataUrl?: string;
      base64?: string;
      mimeType?: string;
      fileName?: string;
    },
  ) {
    return this.fbGcsService.uploadAdminImage(body);
  }

  @Get('config')
  getConfig() {
    return this.fbIngestionService.getConfigWithDiagnostics();
  }

  @Get('resolve-location')
  resolveLocation(
    @Query('q') q?: string,
    @Query('groupName') groupName?: string,
  ) {
    return this.fbIngestionService.resolveAdminLocationQuery(q || '', groupName || '');
  }

  @Patch('config')
  updateConfig(
    @Body()
    body: {
      isLive?: boolean;
      pollIntervalMinutes?: number;
      onlyActiveHours?: boolean;
      activeHourStart?: number;
      activeHourEnd?: number;
      geminiModel?: string;
      autoApproveEnabled?: boolean;
      autoApproveMinQualityScore?: number;
      autoApproveAllowEstimatedPrice?: boolean;
      lastError?: string | null;
    },
  ) {
    return this.fbIngestionService.updateConfig(body);
  }

  @Get('groups')
  listGroups() {
    return this.fbIngestionService.listGroups();
  }

  @Post('groups')
  addGroup(
    @Body()
    body: {
      url: string;
      name?: string;
      scrapeLimitPer30Min?: number;
      isActive?: boolean;
    },
  ) {
    return this.fbIngestionService.addGroup(body);
  }

  @Patch('groups/:groupId')
  updateGroup(
    @Param('groupId') groupId: string,
    @Body()
    body: {
      name?: string;
      isActive?: boolean;
      scrapeLimitPer30Min?: number;
      fbActivityNote?: string;
    },
  ) {
    return this.fbIngestionService.updateGroup(groupId, body);
  }

  @Delete('groups/:groupId')
  deleteGroup(@Param('groupId') groupId: string) {
    return this.fbIngestionService.deleteGroup(groupId);
  }

  @Get('overlap-matrix')
  getOverlapMatrix() {
    return this.fbIngestionService.getOverlapMatrix();
  }

  @Get('snapshots')
  listSnapshots() {
    return this.fbIngestionService.listRemoteSnapshots();
  }

  @Post('run')
  runActiveGroups(@Body() body?: { groupIds?: string[]; async?: boolean }) {
    if (body?.async) {
      return this.fbIngestionService.startRunInBackground(body.groupIds);
    }
    return this.fbIngestionService.runActiveGroups(body?.groupIds);
  }

  @Post('run/cancel')
  cancelActiveRun() {
    return this.fbIngestionService.cancelActiveRun();
  }

  @Post('import-snapshot')
  importSnapshot(@Body() body: { snapshotId: string; async?: boolean }) {
    if (body?.async) {
      return this.fbIngestionService.startImportInBackground(body?.snapshotId);
    }
    return this.fbIngestionService.importSnapshot(body?.snapshotId);
  }

  @Post('pending-snapshots/recover')
  recoverPendingSnapshot(@Body() body?: { snapshotId?: string }) {
    return this.fbIngestionService.recoverPendingSnapshot(body?.snapshotId);
  }

  @Delete('pending-snapshots/:snapshotId')
  dismissPendingSnapshot(@Param('snapshotId') snapshotId: string) {
    return this.fbIngestionService.dismissPendingSnapshot(snapshotId);
  }

  @Get('candidates')
  listCandidates(
    @Query('status') status?: string,
    @Query('groupId') groupId?: string,
    @Query('type') type?: string,
    @Query('houseType') houseType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.fbIngestionService.listCandidates({
      status,
      groupId,
      type,
      houseType,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 25,
    });
  }

  @Post('candidates/reanalyze-pending')
  reanalyzePendingCandidates() {
    return this.fbIngestionService.reanalyzePendingCandidates();
  }

  @Post('candidates/auto-approve-eligible')
  autoApproveEligibleCandidates() {
    return this.fbIngestionService.autoApprovePendingCandidates();
  }

  @Post('candidates/:id/reanalyze')
  reanalyzeCandidate(@Param('id') id: string) {
    return this.fbIngestionService.reanalyzeCandidate(id);
  }

  @Patch('candidates/:id')
  updateCandidate(@Param('id') id: string, @Body() body: Record<string, any>) {
    return this.fbIngestionService.updateCandidate(id, body);
  }

  @Post('candidates/:id/approve')
  approveCandidate(
    @Param('id') id: string,
    @Req() req: { adminUser?: { _id: string } },
    @Body() body?: { edits?: Record<string, any> },
  ) {
    return this.fbIngestionService.approveCandidate(
      id,
      String(req.adminUser?._id || ''),
      body?.edits,
    );
  }

  @Post('candidates/:id/unpublish')
  unpublishCandidate(@Param('id') id: string) {
    return this.fbIngestionService.unpublishCandidate(id);
  }

  @Delete('candidates/:id')
  rejectCandidate(@Param('id') id: string) {
    return this.fbIngestionService.rejectCandidate(id);
  }

  @Get('properties')
  listAdminProperties(
    @Query('origin') origin?: string,
    @Query('claimStatus') claimStatus?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.fbIngestionService.listAdminProperties({
      origin,
      claimStatus,
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 25,
    });
  }

  @Get('properties/backfill-shadow-owners/status')
  getBackfillStatus() {
    return this.fbIngestionService.getBackfillStatus();
  }

  @Post('properties/backfill-shadow-owners/cancel')
  cancelBackfill() {
    return this.fbIngestionService.cancelBackfill();
  }

  @Post('properties/backfill-shadow-owners')
  backfillLegacyScrapedProperties(@Body() body?: { async?: boolean }) {
    if (body?.async) {
      return this.fbIngestionService.startBackfillInBackground();
    }
    return this.fbIngestionService.backfillLegacyScrapedProperties();
  }
}

