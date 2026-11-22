/**
 * The site's content after the admin's live edits (siteContent/live) are applied.
 * Sections read it with useContent() instead of importing data/content.json, so a
 * publish from /admin -> Content shows up without a rebuild.
 */
import { createContext, useContext } from 'react';
import { content as base, projects, type Content } from './content';

export interface LiveContent { content: Content; projectCount: number }
export const ContentContext = createContext<LiveContent>({ content: base, projectCount: projects.length });
export const useLive = () => useContext(ContentContext);
export const useContent = () => useContext(ContentContext).content;
