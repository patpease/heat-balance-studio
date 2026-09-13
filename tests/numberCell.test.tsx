// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NumberCell } from '../src/ui/NumberCell';

/**
 * The stale-closure regression.
 *
 * `commit` used to read `draft` from the render that created it, so a blur
 * arriving before React re-rendered with the latest keystroke wrote the OLD
 * value straight back — the field showing the new number while the store held
 * the old one. A human typing is always slow enough to re-render first, which
 * is why this survived five phases of manual use before the browser caught it.
 */
// Vitest globals are off here, so testing-library's auto-cleanup never runs and
// each render stacks another input into the same document.
afterEach(cleanup);

describe('NumberCell commits what is on screen', () => {
  it('commits the typed value when change and blur land in the same tick', () => {
    const onCommit = vi.fn();
    render(<NumberCell label="value" value={0.211} decimals={3} onCommit={onCommit} />);
    const input = screen.getByLabelText('value') as HTMLInputElement;

    // No await between them: this is the ordering that used to lose the edit.
    fireEvent.change(input, { target: { value: '0.077' } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(0.077);
  });

  it('commits on Enter as well as on blur', () => {
    const onCommit = vi.fn();
    render(<NumberCell label="value" value={1} decimals={2} onCommit={onCommit} />);
    const input = screen.getByLabelText('value') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '2.50' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith(2.5);
  });

  it('does not commit per keystroke, so an intermediate 0 never reaches the store', () => {
    // Typing "0.2" passes through "0", and a zero U-value throws out of uToR.
    const onCommit = vi.fn();
    render(<NumberCell label="value" value={0.211} decimals={3} onCommit={onCommit} />);
    const input = screen.getByLabelText('value') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.change(input, { target: { value: '0.' } });
    fireEvent.change(input, { target: { value: '0.2' } });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(0.2);
  });

  it('restores the stored value on Escape', () => {
    const onCommit = vi.fn();
    render(<NumberCell label="value" value={5} decimals={1} onCommit={onCommit} />);
    const input = screen.getByLabelText('value') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('5.0');

    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(5);
  });

  it('puts back the stored value rather than committing nonsense', () => {
    const onCommit = vi.fn();
    render(<NumberCell label="value" value={0.2} decimals={3} onCommit={onCommit} />);
    const input = screen.getByLabelText('value') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);

    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('0.200');
  });

  it('follows the stored value when something else moves it', () => {
    // Editing R rewrites U, and sketch-a-box rewrites every row at once.
    const { rerender } = render(<NumberCell label="value" value={0.2} decimals={3} onCommit={vi.fn()} />);
    const input = screen.getByLabelText('value') as HTMLInputElement;
    expect(input.value).toBe('0.200');

    rerender(<NumberCell label="value" value={1.2} decimals={3} onCommit={vi.fn()} />);
    expect(input.value).toBe('1.200');
  });
});

/**
 * Thousands separators.
 *
 * The field is grouped at rest and plain while it has focus. The swap matters:
 * formatting mid-edit moves the caret under the typist, and it means every
 * keystroke has to be parsed back through a half-formed string.
 */
describe('NumberCell groups digits', () => {
  it('groups above a thousand when nobody is typing', () => {
    render(<NumberCell label="area" value={64583} decimals={0} onCommit={vi.fn()} />);
    expect((screen.getByLabelText('area') as HTMLInputElement).value).toBe('64,583');
  });

  it('leaves small numbers alone', () => {
    render(<NumberCell label="u" value={0.211} decimals={3} onCommit={vi.fn()} />);
    expect((screen.getByLabelText('u') as HTMLInputElement).value).toBe('0.211');
  });

  /**
   * The regression that cost a caret.
   *
   * The field used to swap `6,000` for `6000` on focus, to keep formatting out
   * of the way while typing. Changing a controlled input's value during its own
   * focus event discards the caret the click just set: clicking at the END of a
   * number to append a digit left the caret at position 0 and typed the digit
   * on the front. The value on screen must not move when the field is entered.
   */
  it('does not change what is on screen when it takes focus', () => {
    render(<NumberCell label="area" value={6000} decimals={0} onCommit={vi.fn()} />);
    const input = screen.getByLabelText('area') as HTMLInputElement;

    const before = input.value;
    fireEvent.focus(input);
    expect(input.value).toBe(before);
    expect(input.value).toBe('6,000');
  });

  it('keeps the caret where the click put it', () => {
    render(<NumberCell label="area" value={6000} decimals={0} onCommit={vi.fn()} />);
    const input = screen.getByLabelText('area') as HTMLInputElement;

    input.setSelectionRange(5, 5); // between the last two digits of "6,000"
    fireEvent.focus(input);
    expect(input.selectionStart).toBe(5);
  });

  it('appends rather than prepends when you type at the end', () => {
    // The user-visible shape of the bug: click at the end, type a zero, and
    // 6,000 became 06000 instead of 60000.
    const onCommit = vi.fn();
    render(<NumberCell label="area" value={6000} decimals={0} onCommit={onCommit} />);
    const input = screen.getByLabelText('area') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: input.value + '0' } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith(60000);
  });

  it('accepts a pasted figure that still carries its commas', () => {
    // Refusing it would look like nothing happened: the field would snap back.
    const onCommit = vi.fn();
    render(<NumberCell label="area" value={100} decimals={0} onCommit={onCommit} />);
    const input = screen.getByLabelText('area') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '12,500' } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith(12500);
  });

  it('puts the separators back after the edit commits', () => {
    const onCommit = vi.fn();
    const { rerender } = render(<NumberCell label="area" value={100} decimals={0} onCommit={onCommit} />);
    const input = screen.getByLabelText('area') as HTMLInputElement;

    fireEvent.focus(input);
    // Free text while editing: no reformatting happens until blur, which is
    // why a half-typed number never moves under the caret.
    fireEvent.change(input, { target: { value: '7500' } });
    fireEvent.blur(input);
    // The parent is what moves the value; this stands in for that round trip.
    rerender(<NumberCell label="area" value={7500} decimals={0} onCommit={onCommit} />);

    expect(input.value).toBe('7,500');
  });
});
