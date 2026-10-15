import { Module } from '@nestjs/common';
import { JournalAuditController } from './journal-audit.controller';
import { JournalAuditService } from './journal-audit.service';

@Module({
  providers: [JournalAuditService],
  controllers: [JournalAuditController],
})
export class AuditModule {}
