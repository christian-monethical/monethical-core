import type { FormField } from '../../api/types';
import { t } from '../../i18n';
import { Button, IconButton } from '../../ui/Button';
import { NumberInput, Select, TextArea, TextInput } from '../../ui/Field';
import { Checkbox } from '../../ui/Switch';
import type { Errors } from '../design/rules';
import { FIELD_TYPES, MAX_FIELDS, uniqueKey } from './model';
import type { FieldType } from './model';

interface Props {
  fields: FormField[];
  errors: Errors;
  onChange: (fields: FormField[]) => void;
}

function FieldRow({
  field,
  index,
  count,
  errors,
  onChange,
  onMove,
  onRemove,
}: {
  field: FormField;
  index: number;
  count: number;
  errors: Errors;
  onChange: (f: FormField) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const p = `fields.${index}`;
  const options = field.options ?? [];
  return (
    <li class="field-card">
      <div class="field-card-head">
        <strong>{field.label || t('forms.untitled_field')}</strong>
        <div class="row">
          <IconButton icon="chevronLeft" label={t('common.move_up')} disabled={index === 0} class="rot-90" onClick={() => onMove(-1)} />
          <IconButton icon="chevronRight" label={t('common.move_down')} disabled={index === count - 1} class="rot-90" onClick={() => onMove(1)} />
          <IconButton icon="trash" label={t('common.delete')} onClick={onRemove} />
        </div>
      </div>
      <div class="grid-2">
        <TextInput label={t('forms.field.label')} value={field.label} maxLength={120} error={errors[`${p}.label`]} onInput={(e) => onChange({ ...field, label: e.currentTarget.value })} />
        <TextInput
          label={t('forms.field.key')}
          mono
          value={field.key}
          maxLength={32}
          hint={t('forms.field.key_hint')}
          error={errors[`${p}.key`]}
          onInput={(e) => onChange({ ...field, key: e.currentTarget.value })}
        />
        <Select<FieldType>
          label={t('forms.field.type')}
          value={field.type}
          options={FIELD_TYPES.map((v) => ({ value: v, label: t(`forms.type.${v}`) }))}
          onChange={(type) => onChange({ ...field, type })}
        />
        <NumberInput label={t('forms.field.max_length')} value={field.max_length} min={1} max={5000} error={errors[`${p}.max_length`]} onChange={(n) => onChange({ ...field, max_length: n })} />
      </div>
      <TextInput label={t('forms.field.placeholder')} value={field.placeholder ?? ''} maxLength={120} error={errors[`${p}.placeholder`]} onInput={(e) => onChange({ ...field, placeholder: e.currentTarget.value || null })} />
      {field.type === 'select' && (
        <TextArea
          label={t('forms.field.options')}
          hint={t('forms.field.options_hint')}
          value={options.join('\n')}
          rows={4}
          error={errors[`${p}.options`]}
          onInput={(e) => onChange({ ...field, options: e.currentTarget.value.split('\n').map((o) => o.trim()).filter(Boolean) })}
        />
      )}
      <Checkbox checked={field.required} onChange={(required) => onChange({ ...field, required })} label={t('forms.field.required')} />
    </li>
  );
}

export function FieldsEditor({ fields, errors, onChange }: Props) {
  const replace = (i: number, f: FormField): void => onChange(fields.map((x, j) => (j === i ? f : x)));
  const move = (i: number, delta: number): void => {
    const next = [...fields];
    const [item] = next.splice(i, 1);
    if (item) next.splice(i + delta, 0, item);
    onChange(next);
  };
  return (
    <div class="stack">
      {errors.fields && <p class="field-error" role="alert">{errors.fields}</p>}
      <ul class="field-list">
        {fields.map((f, i) => (
          <FieldRow
            key={i}
            field={f}
            index={i}
            count={fields.length}
            errors={errors}
            onChange={(next) => replace(i, next)}
            onMove={(d) => move(i, d)}
            onRemove={() => onChange(fields.filter((_, j) => j !== i))}
          />
        ))}
      </ul>
      <Button
        icon="plus"
        disabled={fields.length >= MAX_FIELDS}
        onClick={() => onChange([...fields, { key: uniqueKey(fields), label: '', type: 'text', required: false, max_length: 500, options: [] }])}
      >
        {t('forms.add_field')}
      </Button>
    </div>
  );
}
