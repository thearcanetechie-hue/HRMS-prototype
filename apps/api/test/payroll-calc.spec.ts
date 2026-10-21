import { annualTax, calculate, professionalTax, structure } from '../src/payroll/calc';

const month = {
  month: '2026-10',
  daysEmployed: 31,
  lopDays: 0,
  overtimeHours: 0,
  reimbursements: 0,
};

describe('Payroll maths', () => {
  it('splits a ₹ 12 L CTC and owes no tax under the rebate', () => {
    const p = calculate(
      { annualCtc: 12_00_000, basicShare: 0.5, metro: true, state: 'Karnataka' },
      month,
    );
    // Employer PF (12% of the ₹ 15,000 ceiling) comes out of the ₹ 1,00,000 monthly CTC.
    expect(p.gross).toBe(98_200);
    expect(p.lines.find((l) => l.key === 'basic')!.amount).toBe(49_100);
    expect(p.lines.find((l) => l.key === 'hra')!.amount).toBe(24_550);
    expect([p.pf, p.esi, p.pt, p.tds]).toEqual([1_800, 0, 200, 0]);
    expect(p.net).toBe(96_200);
  });

  it('works out new-regime tax with slabs and cess', () => {
    expect(annualTax(29_01_000)).toBe(4_68_312);
    // Marginal relief just above ₹ 12 L: tax can't exceed the income over the limit.
    expect(annualTax(12_10_000)).toBe(10_400);
    expect(annualTax(12_00_000)).toBe(0);
    const p = calculate(
      { annualCtc: 30_00_000, basicShare: 0.5, metro: true, state: 'Karnataka' },
      month,
    );
    expect(p.tds).toBe(39_026);
  });

  it('applies ESI to low wages, with employer ESI inside CTC', () => {
    const s = structure({ annualCtc: 2_40_000, basicShare: 0.5, metro: false, state: 'Karnataka' });
    expect(s.esiApplies).toBe(true);
    expect(s.gross).toBe(18_307);
    const p = calculate(
      { annualCtc: 2_40_000, basicShare: 0.5, metro: false, state: 'Karnataka' },
      month,
    );
    expect([p.pf, p.esi, p.pt]).toEqual([1_099, 138, 0]);
    expect(p.net).toBe(17_070);
  });

  it('prorates for loss of pay and part months, and pays overtime at double rate', () => {
    const s = { annualCtc: 12_00_000, basicShare: 0.5, metro: true, state: 'Karnataka' };
    const lop = calculate(s, { ...month, lopDays: 3.1 });
    expect(lop.payableDays).toBeCloseTo(27.9);
    // 27.9 of 31 days is 90% of the ₹ 98,200 gross.
    expect(lop.gross).toBe(88_380);
    const joiner = calculate(s, { ...month, daysEmployed: 17 });
    expect(joiner.payableDays).toBe(17);
    // 49,100 / 26 / 8 = 236.06 an hour; 3 hours at double rate.
    const ot = calculate(s, { ...month, overtimeHours: 3 });
    expect(ot.overtimePay).toBe(1_416);
  });

  it('uses state professional tax slabs, including February', () => {
    expect(professionalTax('Karnataka', 30_000, '2027-02')).toBe(300);
    expect(professionalTax('Maharashtra', 9_000, '2026-10')).toBe(175);
    expect(professionalTax('Delhi', 90_000, '2026-10')).toBe(0);
  });
});
