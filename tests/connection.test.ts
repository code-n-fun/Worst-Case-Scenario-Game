import {afterEach,it,expect,vi} from 'vitest';
import {projectConfig,sharedProject,validatePublicProject} from '../src/lib/project-config';
afterEach(()=>vi.unstubAllEnvs());
it('provides the shared project in a fresh browser without local settings',()=>{
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','');
 expect(projectConfig()).toEqual(sharedProject);
});
it('rejects secret keys and URLs with embedded credentials',()=>{
 expect(()=>validatePublicProject('https://example.supabase.co','sb_secret_not_a_real_key_123456')).toThrow(/public/);
 const jwt='test.'+btoa(JSON.stringify({role:'service_role'}))+'.test';
 expect(()=>validatePublicProject('https://example.supabase.co',jwt)).toThrow(/public/);
 expect(()=>validatePublicProject('https://user:pass@example.supabase.co',sharedProject.key)).toThrow(/origin/);
});
it('supports owner deployment overrides and never mixes two project configurations',()=>{
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://owner-example.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','');
 expect(()=>projectConfig()).toThrow();vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','sb_publishable_example_1234567890');
 expect(projectConfig().url).toBe('https://owner-example.supabase.co');
});
