import { createContext } from 'react';

// The builder draws every placed field, an empty one saying so: the word it gives the item (its
// type). Elsewhere an item shows the fields it has a value for.
export const ShowEmpty = createContext<string | undefined>(undefined);
