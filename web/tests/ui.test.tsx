import { fireEvent, render, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { describe, expect, it, vi } from 'vitest';
import { normalizeDomain, validateDomain } from '../src/features/sites/domains';
import { ColorField, isHexColor } from '../src/ui/ColorField';
import { Dialog } from '../src/ui/Dialog';
import { TagInput } from '../src/ui/TagInput';

function DialogHarness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>trigger</button>
      <Dialog
        open={open}
        title="Titolo"
        onClose={() => {
          setOpen(false);
          onClose();
        }}
        footer={<button>last</button>}
      >
        <input aria-label="first" />
      </Dialog>
    </div>
  );
}

describe('Dialog', () => {
  it('moves focus in, traps Tab, closes on Escape and restores focus', async () => {
    const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} />);
    const trigger = screen.getByText('trigger');
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Titolo' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const first = screen.getByLabelText('first');
    expect(document.activeElement).toBe(first);

    const last = screen.getByText('last');
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).not.toBe(last); // wrapped to the first focusable (close button)
    expect(dialog.contains(document.activeElement)).toBe(true);

    const close = screen.getByRole('button', { name: /chiudi/i });
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last); // shift+tab on the first wraps to the last

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

function TagHarness({ onChange }: { onChange: (v: string[]) => void }) {
  const [values, setValues] = useState<string[]>([]);
  return (
    <TagInput
      label="Domini"
      values={values}
      normalize={normalizeDomain}
      validate={validateDomain}
      max={3}
      onChange={(v) => {
        setValues(v);
        onChange(v);
      }}
    />
  );
}

describe('TagInput', () => {
  it('normalizes pasted URLs, adds on Enter and ignores duplicates', () => {
    const onChange = vi.fn();
    render(<TagHarness onChange={onChange} />);
    const input = screen.getByLabelText('Domini');
    fireEvent.input(input, { target: { value: 'https://WWW.Example.com/path' } });
    expect(screen.getByText(/www\.example\.com/)).toBeTruthy(); // "will be saved as" hint
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(['www.example.com']);
    fireEvent.input(input, { target: { value: 'www.example.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(['www.example.com']);
  });

  it('splits comma/space separated paste into several tags', () => {
    const onChange = vi.fn();
    render(<TagHarness onChange={onChange} />);
    fireEvent.input(screen.getByLabelText('Domini'), { target: { value: 'a.example.com, b.example.com ' } });
    expect(onChange).toHaveBeenLastCalledWith(['a.example.com', 'b.example.com']);
  });

  it('shows validation errors and does not add invalid values', () => {
    const onChange = vi.fn();
    render(<TagHarness onChange={onChange} />);
    const input = screen.getByLabelText('Domini');
    fireEvent.input(input, { target: { value: 'not a domain' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toMatch(/non è un dominio valido/);
  });

  it('removes the last tag with Backspace and enforces the maximum', () => {
    const onChange = vi.fn();
    render(<TagHarness onChange={onChange} />);
    const input = screen.getByLabelText('Domini');
    fireEvent.input(input, { target: { value: 'a.example.com b.example.com c.example.com d.example.com ' } });
    expect(onChange).toHaveBeenLastCalledWith(['a.example.com', 'b.example.com', 'c.example.com']);
    expect(screen.getByRole('alert').textContent).toMatch(/Massimo 3/);
    fireEvent.input(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).toHaveBeenLastCalledWith(['a.example.com', 'b.example.com']);
  });
});

describe('ColorField', () => {
  it('accepts #RRGGBB and #RRGGBBAA only', () => {
    expect(isHexColor('#00798a')).toBe(true);
    expect(isHexColor('#00798A80')).toBe(true);
    expect(isHexColor('#fff')).toBe(false);
    expect(isHexColor('00798a')).toBe(false);
    expect(isHexColor('#00798g')).toBe(false);
  });

  it('emits valid colors (lowercased) and flags invalid input without emitting', () => {
    const onChange = vi.fn();
    render(<ColorField label="Accent" value="#000000" onChange={onChange} />);
    const input = screen.getByLabelText('Accent');
    fireEvent.input(input, { target: { value: '#ABCDEF' } });
    expect(onChange).toHaveBeenCalledWith('#abcdef');
    onChange.mockClear();
    fireEvent.input(input, { target: { value: '#12' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/non valido/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
});
