import { renderMarkdown } from '../markdown.ts';

// What an agent or the person wrote in a note (a handoff, a send-back reason), read as Markdown:
// its lists, code and tables drawn, never its raw marks. Safe: renderMarkdown escapes raw HTML.
export function NoteText({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={className ? `md note-md ${className}` : 'md note-md'}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: renderMarkdown escapes raw HTML and drops dangerous links
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
    />
  );
}
