/** Parse the stored `source_tags_json` column into a list of Steam tags. */
export function parseSourceTags(sourceTagsJson: string): readonly string[] {
  const tags: unknown = JSON.parse(sourceTagsJson)
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string')) {
    throw new Error('Stored source tags are not a string array')
  }

  return tags
}
