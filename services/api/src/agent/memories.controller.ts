import { BadRequestException, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AuthedRequest, SupabaseAuthGuard } from '../auth/auth.guard';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * "What TRILLION knows". Confirmed memories are injected into prompts; pending ones (saved while a run
 * had read web or private content) are shown here and used only after the user confirms them.
 */
@Controller('memories')
@UseGuards(SupabaseAuthGuard)
export class MemoriesController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  async list(@Req() req: AuthedRequest) {
    const { data, error } = await this.supabase
      .admin()
      .from('memories')
      .select('id, content, confirmed, source, created_at')
      .eq('owner_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw new BadRequestException('Could not load memories.');
    return data ?? [];
  }

  @Post(':id/confirm')
  async confirm(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    const { data, error } = await this.supabase
      .admin()
      .from('memories')
      .update({ confirmed: true })
      .eq('id', id)
      .eq('owner_id', req.user.id)
      .select('id, content, confirmed, source, created_at')
      .maybeSingle();
    if (error) throw new BadRequestException('Could not confirm the memory.');
    if (!data) throw new NotFoundException();
    return data;
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    const { error, count } = await this.supabase.admin().from('memories').delete({ count: 'exact' }).eq('id', id).eq('owner_id', req.user.id);
    if (error) throw new BadRequestException('Could not delete the memory.');
    if (!count) throw new NotFoundException();
    return { ok: true };
  }
}
