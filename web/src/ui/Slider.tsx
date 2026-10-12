import { Field } from './Field';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  unit?: string;
}

export function Slider({ label, value, min, max, onChange, unit = '' }: Props) {
  return (
    <Field label={`${label}: ${value}${unit}`}>
      {({ id }) => (
        <input
          id={id}
          type="range"
          class="slider"
          min={min}
          max={max}
          value={value}
          onInput={(e) => onChange(e.currentTarget.valueAsNumber)}
        />
      )}
    </Field>
  );
}
