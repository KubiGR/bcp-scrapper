import type { ListExportFormat } from '@bcp/shared';
import type { ExportedList } from './repo/lists';

const RULE = '='.repeat(72);

/** A plain-text file with every list, one titled block each, ready to paste or print. */
export function listsToText(eventName: string, lists: ExportedList[]): string {
  const header = `${eventName}\n${lists.length} army lists\n`;
  const blocks = lists.map((list) => {
    const title = [
      list.placing === null ? null : `#${list.placing}`,
      list.player,
      list.team,
      list.faction,
    ]
      .filter((part): part is string => part !== null)
      .join(' · ');
    return `${RULE}\n${title}\n${RULE}\n${list.text ?? '(empty list)'}\n`;
  });
  return [header, ...blocks].join('\n');
}

/** A download name made only of [a-z0-9-], so it's safe inside Content-Disposition. */
export function exportFileName(eventName: string, format: ListExportFormat): string {
  const slug = eventName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug === '' ? 'event' : slug}-lists.${format}`;
}
