import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FbAdminGuard } from './fb-admin.guard';
import { FbIngestionService } from './fb-ingestion.service';

@Controller('api/fb-ingestion')
export class FbIngestionAuthController {
  constructor(private readonly fbIngestionService: FbIngestionService) {}

  @Post('admin-login')
  adminLogin(@Body() body: { identifier: string; password: string }) {
    return this.fbIngestionService.adminLogin(body?.identifier, body?.password);
  }
}

@Controller('api/fb-ingestion')
@UseGuards(FbAdminGuard)
export class FbIngestionController {
  constructor(private readonly fbIngestionService: FbIngestionService) {}

  @Get('config')
  getConfig() {
    return this.fbIngestionService.getConfig();
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

  @Post('import-snapshot')
  importSnapshot(@Body() body: { snapshotId: string; async?: boolean }) {
    if (body?.async) {
      return this.fbIngestionService.startImportInBackground(body?.snapshotId);
    }
    return this.fbIngestionService.importSnapshot(body?.snapshotId);
  }

  @Get('candidates')
  listCandidates(
    @Query('status') status?: string,
    @Query('groupId') groupId?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.fbIngestionService.listCandidates({
      status,
      groupId,
      type,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 25,
    });
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

  @Delete('candidates/:id')
  rejectCandidate(@Param('id') id: string) {
    return this.fbIngestionService.rejectCandidate(id);
  }
}

