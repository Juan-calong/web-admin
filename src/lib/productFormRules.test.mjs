import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProductList, checkListChange, checkDecimal, checkDecimalDraft, checkFiscal, checkInteger, fiscalErrorMessage, wouldExceedTextLimit, PRODUCT_FORM_LIMITS } from './productFormRules.ts';
import { formatProductIssues } from './productIssues.ts';
import { apiErrorMessage } from './apiError.ts';
import * as rules from './productFormRules.ts';

for (const [field, limit] of Object.entries({ effects: 500, benefits: 500, howToUse: 1000 })) {
  test(`${field} item and count boundaries`, () => {
    assert.equal(checkListChange('x'.repeat(limit), field).ok, true);
    assert.equal(checkListChange('x'.repeat(limit + 1), field).ok, false);
    assert.equal(checkListChange(Array(20).fill('x').join('\n'), field).ok, true);
    assert.equal(checkListChange(Array(21).fill('x').join('\n'), field).ok, false);
  });
}
test('list parser matches payload separators', () => {
  assert.deepEqual(parseProductList('1. Brilho; Maciez\n• Hidratação'), ['Brilho', 'Maciez', 'Hidratação']);
});
test('a valid list edit clears only its external issue', () => {
  assert.equal(typeof rules.clearCorrectedListError, 'function');
  const errors = { benefits: 'Erro antigo', price: 'Outro erro' };
  assert.deepEqual(rules.clearCorrectedListError(errors, 'benefits', 'x'.repeat(501)), errors);
  assert.deepEqual(rules.clearCorrectedListError(errors, 'benefits', 'Corrigido'), { price: 'Outro erro' });
});
test('replacing fiscal errors preserves product errors and vice versa', () => {
  assert.equal(typeof rules.replaceScopedProductErrors, 'function');
  const current = { sku: 'SKU inválido', ncm: 'NCM inválido' };
  assert.deepEqual(rules.replaceScopedProductErrors(current, { cest: 'CEST inválido' }, 'fiscal'), { sku: 'SKU inválido', cest: 'CEST inválido' });
  assert.deepEqual(rules.replaceScopedProductErrors(current, { price: 'Preço inválido' }, 'product'), { ncm: 'NCM inválido', price: 'Preço inválido' });
});
test('description boundary', () => {
  assert.equal(PRODUCT_FORM_LIMITS.description, 2000);
  assert.equal('x'.repeat(2000).length <= PRODUCT_FORM_LIMITS.description, true);
  assert.equal('x'.repeat(2001).length <= PRODUCT_FORM_LIMITS.description, false);
});
test('decimal and fiscal contracts', () => {
  assert.equal(checkDecimal('12,34', 2), true);
  assert.equal(checkDecimal('12.345', 2), false);
  assert.equal(checkDecimal('0,123', 3), true);
  assert.equal(checkFiscal('ncm', '33059000'), true);
  assert.equal(checkFiscal('ncm', '3305900'), false);
  assert.equal(checkFiscal('cest', '1234567'), true);
  assert.equal(checkFiscal('cest', '12345678'), false);
});
test('product price accepts zero in both create and update', () => {
  assert.equal(typeof rules.validProductPrice, 'function');
  assert.equal(rules.validProductPrice('0'), true);
  assert.equal(rules.validProductPrice('0,00'), true);
  assert.equal(rules.validProductPrice(''), false);
  assert.equal(rules.validProductPrice('-1'), false);
});
test('decimal draft allows a partial separator but rejects impossible precision and paste', () => {
  assert.equal(checkDecimalDraft('12,', 2), true);
  assert.equal(checkDecimalDraft('12,34', 2), true);
  assert.equal(checkDecimalDraft('12,345', 2), false);
  assert.equal(checkDecimalDraft('12,3.4', 2), false);
  assert.equal(checkDecimalDraft('abc', 2), false);
});
test('issues take priority and identify item', () => {
  const result = formatProductIssues({ error: 'Dados inválidos', issues: [{ path: ['benefits', 0], msg: 'Too big: expected string to have <=500 characters' }] });
  assert.match(result.message, /Ativos e funções.*item 1.*500/);
  assert.notEqual(result.message, 'Dados inválidos');
  assert.equal(result.fields.benefits.includes('500'), true);
});
test('array counts and fiscal patterns have human explanations', () => {
  const count = formatProductIssues({ error: 'Dados inválidos', issues: [{ path: ['categoryIds'], msg: 'Too big: expected array to have <=20 items' }] });
  assert.match(count.message, /Categorias.*20 itens/);
  const ncm = formatProductIssues({ error: 'Dados inválidos', issues: [{ path: ['ncm'], msg: 'Invalid string: must match pattern /^\\d{8}$/' }] });
  assert.match(ncm.message, /NCM.*8 dígitos/);
});
test('generic API error keeps the public error instead of technical issues', () => {
  assert.equal(apiErrorMessage({ response: { data: { error: 'Dados inválidos', issues: [{ msg: 'Too big: expected string to have <=500 characters' }] } } }), 'Dados inválidos');
});
test('video order accepts negative integers because backend has no minimum', () => {
  assert.equal(checkInteger('-1'), true);
  assert.equal(checkInteger('1.5'), false);
  assert.equal(checkInteger('-2147483648'), true);
  assert.equal(checkInteger('2147483647'), true);
  assert.equal(checkInteger('-2147483649'), false);
  assert.equal(checkInteger('2147483648'), false);
});
test('fiscal validation explains exact formats', () => {
  assert.match(fiscalErrorMessage('ncm', 'NCM'), /8 dígitos/);
  assert.match(fiscalErrorMessage('unit', 'Unidade comercial'), /2 a 6 letras/);
});
test('fiscal paste rejects an overlong replacement without changing the current value', () => {
  assert.equal(typeof rules.fiscalPasteError, 'function');
  assert.match(rules.fiscalPasteError('ncm', '12345678', 0, 8, '123456789'), /8 dígitos/);
  assert.match(rules.fiscalPasteError('fiscalDescription', 'abc', 3, 3, 'x'.repeat(498)), /500 caracteres/);
  assert.equal(rules.fiscalPasteError('cest', '1234567', 0, 7, '7654321'), '');
});
test('invalid file selection replaces the previous intent with no selected files', () => {
  assert.equal(typeof rules.resolveImageSelection, 'function');
  assert.deepEqual(rules.resolveImageSelection([{ type: 'image/jpeg', size: 1 }]).files.length, 1);
  const invalidImages = rules.resolveImageSelection([{ type: 'image/gif', size: 123 }]);
  assert.deepEqual(invalidImages.files, []);
  assert.match(invalidImages.error, /JPG, PNG ou WEBP/);
  assert.deepEqual(rules.resolveVideoSelection({ type: 'text/plain' }).file, null);
});
test('image upload content type matches the backend MIME allowlist', () => {
  assert.equal(typeof rules.productImageContentType, 'function');
  for (const mime of ['image/jpeg', 'image/png', 'image/webp']) assert.equal(rules.productImageContentType(mime), mime);
  assert.throws(() => rules.productImageContentType('image/jpg'), /JPG, PNG ou WEBP/);
});
test('description paste rejects excess without losing existing text', () => {
  assert.equal(wouldExceedTextLimit('x'.repeat(1999), 1999, 1999, 'ab', 2000), true);
  assert.equal(wouldExceedTextLimit('x'.repeat(2000), 1999, 2000, 'ab', 2000), true);
  assert.equal(wouldExceedTextLimit('x'.repeat(2000), 1998, 2000, 'ab', 2000), false);
});
