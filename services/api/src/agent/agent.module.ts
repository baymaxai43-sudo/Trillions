import { Module } from '@nestjs/common';
import { ConnectModule } from '../connect/connect.module';
import { AgentController } from './agent.controller';
import { AgentRunner } from './agent-runner.service';
import { MemoriesController } from './memories.controller';
import { RunManager } from './run-manager.service';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [ConnectModule],
  controllers: [AgentController, MemoriesController],
  providers: [RunManager, AgentRunner, SchedulerService],
})
export class AgentModule {}
