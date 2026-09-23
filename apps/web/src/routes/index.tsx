import { createFileRoute } from '@tanstack/react-router';
import { FinderPage } from '../features/finder/FinderPage';
import { FinderSearchSchema } from '../features/finder/finder-search';

export const Route = createFileRoute('/')({
  validateSearch: FinderSearchSchema,
  component: FinderPage,
});
