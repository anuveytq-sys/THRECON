import {describe,expect,it} from 'vitest';
import {createProject,isProject,starterItems} from './project';
describe('THRECON project schema',()=>{it('creates a valid starter project',()=>expect(isProject(createProject(starterItems()))).toBe(true));it('rejects unknown schema versions',()=>expect(isProject({schemaVersion:99,name:'x',items:[]})).toBe(false));});