import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearningPath, requestSchema, type GeneratedPath } from '../lib/learning';
import { POST } from '../app/api/chat/route';

function fixture(): GeneratedPath {
  const prerequisites = [[], [], [], ['topic-0', 'topic-1'], ['topic-1', 'topic-2'], ['topic-3', 'topic-4']];
  return {
    title: 'Photography for beginners', description: 'Learn exposure, composition, and editing through practical projects.',
    topics: prerequisites.map((parents, i) => ({
      id: `topic-${i}`, title: ['Exposure', 'Composition', 'Camera controls', 'Portrait lighting', 'Photo editing', 'Portfolio project'][i],
      description: 'Practice the concept with a guided exercise.', difficulty: i < 3 ? 'Beginner' : i < 5 ? 'Intermediate' : 'Advanced', hours: 3,
      prerequisites: parents, concepts: ['Practice', 'Review'],
    })),
  };
}

test('lays out arbitrary topic IDs with correct forward edges without invented resources', () => {
  const path = buildLearningPath(fixture());
  assert.equal(path.source, 'claude');
  assert.equal(path.topics.length, 7);
  const positions = new Set<string>();
  for (const topic of path.topics) {
    assert.ok(!positions.has(`${topic.x}:${topic.y}`));
    positions.add(`${topic.x}:${topic.y}`);
    for (const id of topic.prerequisites) {
      const parent = path.topics.find(t => t.id === id)!;
      assert.ok(parent.y < topic.y);
      assert.ok(parent.children.includes(topic.id));
    }
    if (topic.id !== '0') {
      assert.deepEqual(topic.resources, []);
    }
  }
});

test('rejects duplicate IDs, cycles, dangling prerequisites', () => {
  const duplicate = fixture(); duplicate.topics[1].id = duplicate.topics[0].id;
  assert.throws(() => buildLearningPath(duplicate), /duplicate/);
  const cycle = fixture(); cycle.topics[0].prerequisites = ['topic-5'];
  assert.throws(() => buildLearningPath(cycle), /prerequisite order/);
  const missing = fixture(); missing.topics[5].prerequisites = ['missing'];
  assert.throws(() => buildLearningPath(missing), /prerequisite order/);
});

test('rejects empty, oversized, and assistant-ending chat input', () => {
  assert.equal(requestSchema.safeParse({messages:[]}).success,false);
  assert.equal(requestSchema.safeParse({messages:[{role:'user',content:' '}]}).success,false);
  assert.equal(requestSchema.safeParse({messages:[{role:'user',content:'a'.repeat(2401)}]}).success,false);
  assert.equal(requestSchema.safeParse({messages:[{role:'assistant',content:'hi'}]}).success,false);
});

function chatRequest(body: unknown, origin = 'http://localhost:3000') {
  return new Request('http://localhost:3000/api/chat', {method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(body)});
}
const validRequest = () => chatRequest({messages:[{role:'user',content:'I am a beginner. Build a photography learning path for portraits.'}]});

test('route validates requests before contacting the provider', async () => {
  assert.equal((await POST(chatRequest({messages:[]}))).status,400);
  assert.equal((await POST(chatRequest({messages:[{role:'user',content:'hello'}]},'https://unrelated.example'))).status,403);
  const boundHost = new Request('http://0.0.0.0:3000/api/chat',{method:'POST',headers:{origin:'http://localhost:3000',host:'localhost:3000'},body:JSON.stringify({messages:[]})});
  assert.equal((await POST(boundHost)).status,400);
});

test('Anthropic integration handles questions, complete paths, malformed graphs, and auth failures', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'unit-test-placeholder';
  let output: unknown = {reply:'What experience do you have, and what would you like to make?',suggestions:['I am a beginner'],path:null};
  let failure = false;
  globalThis.fetch = async (_input, init) => {
    assert.match(String(init?.body), /claude-sonnet/);
    if (failure) return Response.json({type:'error',error:{type:'authentication_error',message:'invalid x-api-key'}},{status:401});
    return Response.json({id:'msg_test',type:'message',role:'assistant',model:'claude-sonnet-4-6',content:[{type:'text',text:JSON.stringify(output)}],stop_reason:'end_turn',stop_sequence:null,usage:{input_tokens:20,output_tokens:100}});
  };
  try {
    const question = await POST(validRequest());
    assert.equal(question.status,200); assert.equal((await question.json()).path,null);
    output = {reply:'Here is your personalized path.',suggestions:['Focus on portraits'],path:fixture()};
    const response = await POST(validRequest());
    const data = await response.json();
    assert.equal(response.status,200); assert.equal(data.path.source,'claude'); assert.equal(data.path.topics.length,7);
    assert.ok(!JSON.stringify(data).includes('unit-test-placeholder'));
    const invalid = fixture(); invalid.topics[0].prerequisites=['topic-5'];
    output = {reply:'A path.',suggestions:[],path:invalid};
    const malformed = await POST(validRequest());
    assert.equal(malformed.status,502); assert.equal((await malformed.json()).path,undefined);
    failure = true;
    const auth = await POST(validRequest());
    assert.equal(auth.status,401); assert.match((await auth.json()).error,/rejected the API key/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY=originalKey;
  }
});
