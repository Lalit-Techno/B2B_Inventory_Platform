import { BOM, csvCell, toCsv } from './csv';

describe('csv', () => {
  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('+1+1')).toBe("'+1+1");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('-cmd|calc')).toBe("'-cmd|calc");
    expect(csvCell('\t=1')).toBe("'\t=1");
  });

  it('leaves ordinary text and plain numbers (also negative) alone', () => {
    expect(csvCell('Acme Traders')).toBe('Acme Traders');
    expect(csvCell('1180.00')).toBe('1180.00');
    expect(csvCell('-1180.00')).toBe('-1180.00');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes cells with commas, quotes and line breaks', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('=1,2')).toBe('"\'=1,2"'); // formula guard and quoting together
  });

  it('builds a UTF-8 file with CRLF rows', () => {
    expect(BOM.charCodeAt(0)).toBe(0xfeff);
    const csv = toCsv([
      ['a', 'b'],
      ['1', '=x'],
    ]);
    expect(csv).toBe(`${BOM}a,b\r\n1,'=x\r\n`);
  });
});
