import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assistantErrorText, historyForRequest, MAX_SENT_MESSAGES, type ChatMessage } from './assistant-chat.ts';

const u = (c: string): ChatMessage => ({ role: 'user', content: c });
const a = (c: string): ChatMessage => ({ role: 'assistant', content: c });

test('a short chat is sent as it is', () => {
  const chat = [u('hi'), a('hello'), u('more')];
  assert.deepEqual(historyForRequest(chat), chat);
});

test('a long chat keeps only its last messages, and starts with one from the owner', () => {
  const chat: ChatMessage[] = [];
  for (let i = 0; i < 30; i++) chat.push(u(`q${i}`), a(`a${i}`));
  const sent = historyForRequest(chat);
  assert.ok(sent.length <= MAX_SENT_MESSAGES);
  assert.equal(sent[0].role, 'user');
  assert.equal(sent[sent.length - 1].content, 'a29');
});

test('a tail that begins with an assistant reply drops it, and nothing owner-written means nothing is sent', () => {
  const chat = [...Array.from({ length: 10 }, () => [u('x'), a('y')]).flat(), u('last')];
  const sent = historyForRequest(chat);
  assert.equal(sent[0].role, 'user');
  assert.equal(sent[sent.length - 1].content, 'last');
  assert.deepEqual(historyForRequest([a('only assistant')]), []);
  assert.deepEqual(historyForRequest([]), []);
});

test('each message is cut to the server limit', () => {
  const sent = historyForRequest([u('x'.repeat(5000))]);
  assert.equal(sent[0].content.length, 4000);
});

test('errors are said in plain words', () => {
  assert.match(assistantErrorText({ response: { status: 404 } }), /not on the server/);
  assert.match(assistantErrorText({ response: { status: 403 } }), /only for the owner/);
  assert.match(assistantErrorText({ response: { status: 429 } }), /Too many/);
  assert.equal(assistantErrorText({ response: { status: 502, data: { error: 'model unavailable' } } }), 'model unavailable');
  assert.match(assistantErrorText({ response: { status: 502 } }), /could not answer/);
  assert.match(assistantErrorText({ code: 'ECONNABORTED' }), /No connection/);
  assert.match(assistantErrorText(undefined), /No connection/);
  assert.match(assistantErrorText({ response: { status: 500, data: { error: 'internal secret detail' } } }), /could not answer/);
});
