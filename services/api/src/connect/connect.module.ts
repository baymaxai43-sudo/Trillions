import { Module } from '@nestjs/common';
import { ConnectController } from './connect.controller';
import { ConnectionsService } from './connections.service';

@Module({ controllers: [ConnectController], providers: [ConnectionsService], exports: [ConnectionsService] })
export class ConnectModule {}
