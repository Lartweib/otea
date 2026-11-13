import { renderMarkdown } from '../markdown.ts';
import type { EditProps, FieldModuleUi, ShowProps } from './contract.ts';

function Rendered({ value }: ShowProps) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: renderMarkdown escapes raw HTML and drops dangerous links
  return <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }} />;
}

function TextArea({ id, value, disabled, required, describedBy, onChange }: EditProps) {
  return (
    <textarea
      id={id}
      className="input"
      value={value}
      disabled={disabled}
      required={required}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

const description = { name: 'description', module: 'markdown', required: 'complete' } as const;

export const markdown: FieldModuleUi = {
  name: 'markdown',
  summary: 'module.markdown.summary',
  origin: 'official',
  Detail: Rendered,
  Edit: TextArea,
  samples: [
    {
      label: 'module.markdown.short',
      field: description,
      value: 'Fails on CI only, see *run 42*.',
    },
    {
      label: 'module.markdown.long',
      field: description,
      value: [
        '## Steps',
        '',
        '1. Run the suite twice in a row.',
        '2. Wait for the session cookie to expire.',
        '',
        '- Happens on `main` since **Tuesday**',
        '- Details in [run 42](https://example.com/runs/42)',
        '',
        '```',
        'npm test -- --retry 2',
        '```',
      ].join('\n'),
    },
    { label: 'module.markdown.empty', field: description, value: '' },
  ],
};
