import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { LegalController } from './legal.controller';
import { ChatModule } from './chat/chat.module';
import { SupabaseModule } from './supabase/supabase.module';
import { ConnectModule } from './connect/connect.module';
import { AgentModule } from './agent/agent.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }), SupabaseModule, ChatModule, ConnectModule, AgentModule],
  controllers: [HealthController, LegalController],
})
export class AppModule {}
