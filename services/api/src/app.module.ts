import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { ChatModule } from './chat/chat.module';
import { SupabaseModule } from './supabase/supabase.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }), SupabaseModule, ChatModule, EmailModule],
  controllers: [HealthController],
})
export class AppModule {}
