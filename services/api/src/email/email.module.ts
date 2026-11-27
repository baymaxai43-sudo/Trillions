import { Module } from '@nestjs/common';
import { HooksController } from './hooks.controller';
import { MailerService } from './mailer.service';

@Module({ controllers: [HooksController], providers: [MailerService] })
export class EmailModule {}
