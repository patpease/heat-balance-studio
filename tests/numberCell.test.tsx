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
