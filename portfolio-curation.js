// GitHub-curated portfolio updates. Firestore remains the source for existing records.
// This module overlays two descriptions and adds four distinct project cards.
// No Firestore writes, credentials, or private repository URLs are involved.
const normalizeName = (value) => String(value ?? '')
    .normalize('NFKC').toLowerCase().replace(/[\s\u3000・]/g, '');

const sameUrl = (left, right) => !!left && !!right &&
    String(left).replace(/\/+$/, '') === String(right).replace(/\/+$/, '');

export function mergePortfolioCuration(existing, categories, platformMap, curation) {
    if (!curation || curation.schemaVersion !== 1 ||
        !Array.isArray(curation.updates) || !Array.isArray(curation.additions)) {
        throw new Error('Unsupported portfolio curation schema');
    }

    const projects = existing.map(project => ({ ...project }));
    const platforms = Object.entries(platformMap || {}).map(([id, data]) => ({ id, ...data }));
    const lookup = (list, label) => list.find(item => normalizeName(item.name) === normalizeName(label));
    const stats = { updated: 0, added: 0, alreadyPresent: 0, unmatched: [] };

    for (const update of curation.updates) {
        const aliases = update.matchTitles || [];
        const project = projects.find(item =>
            aliases.some(name => normalizeName(item.title) === normalizeName(name)));
        if (!project) {
            stats.unmatched.push(aliases[0] || '(untitled update)');
            continue;
        }
        Object.assign(project, update.fields || {});
        stats.updated += 1;
    }

    for (const [index, addition] of curation.additions.entries()) {
        const aliases = addition.matchTitles || [addition.title];
        const exists = projects.some(item =>
            aliases.some(name => normalizeName(item.title) === normalizeName(name)) ||
            sameUrl(item.url, addition.url));
        if (exists) {
            stats.alreadyPresent += 1;
            continue;
        }

        const category = lookup(categories, addition.category);
        const deploy = lookup(platforms, addition.deployPlatform);
        const code = lookup(platforms, addition.codePlatform);
        if (!category || !deploy) {
            stats.unmatched.push(addition.title + ' (category/platform)');
            continue;
        }

        const { matchTitles, category: categoryName, codePlatform, deployPlatform, ...fields } = addition;
        projects.push({
            ...fields,
            id: 'curated-20261019-' + (index + 1),
            categoryId: category.id,
            codePlatformId: code?.id || '',
            deployPlatformId: deploy.id,
            _githubCurated: true
        });
        stats.added += 1;
    }

    return { projects, stats };
}

export async function applyPortfolioCuration(existing, categories, platforms) {
    const response = await fetch('./data/portfolio-curation-20261019.json', {
        cache: 'no-store'
    });
    if (!response.ok) throw new Error('Portfolio curation fetch failed: ' + response.status);
    return mergePortfolioCuration(existing, categories, platforms, await response.json());
}
