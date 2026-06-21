// Analyze the JSON output from Beatport scraper v2
const fs = require('fs');

const data = JSON.parse(fs.readFileSync('/home/z/my-project/upload/labelpulse_beatport_2026-06-21.json', 'utf8'));

console.log('=== METADATA ===');
console.log(JSON.stringify(data._meta, null, 2));

console.log('\n=== LABELS ===');
console.log('Total labels:', data.labels.length);
console.log('Sample label (first):');
console.log(JSON.stringify(data.labels[0], null, 2).split('\n').slice(0, 25).join('\n'));

// Find labels with most genres
const labelsByGenreCount = [...data.labels].sort((a, b) => b.genres.length - a.genres.length);
console.log('\nTop 5 labels by genre count:');
labelsByGenreCount.slice(0, 5).forEach(l => {
  console.log(`  ${l.name}: ${l.genres.length} genres, ${l.genres.join(', ')}`);
});

console.log('\n=== ARTISTS ===');
console.log('Total artists:', data.artists.length);
console.log('Sample artist (first):');
console.log(JSON.stringify(data.artists[0], null, 2).split('\n').slice(0, 30).join('\n'));

console.log('\nTop 10 artists by totalPoints:');
[...data.artists].sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 10).forEach((a, i) => {
  console.log(`  ${i + 1}. ${a.name} — ${a.totalPoints} pts, ${a.genres.length} genres, ${a.labelsPublishedOn.length} labels, bestPos: ${a.bestPosition}, trending: ${a.trending}`);
});

// Find Adam Beyer (mentioned by user) if present
const beyer = data.artists.find(a => a.name.toLowerCase().includes('beyer'));
if (beyer) {
  console.log('\n=== ADAM BEYER (user example) ===');
  console.log(JSON.stringify(beyer, null, 2));
} else {
  console.log('\nAdam Beyer not found in this scrape (not in current top-100).');
}

// Look for some famous artists to verify data quality
const famousNames = ['Adam Beyer', 'John Summit', 'Charlotte de Witte', 'Amelie Lens', 'Mochakk', 'Fisher', 'Peggy Gou', 'Tale Of Us', 'Anyma', 'Eric Prydz'];
console.log('\n=== FAMOUS ARTISTS CHECK ===');
famousNames.forEach(name => {
  const matches = data.artists.filter(a => a.name.toLowerCase().includes(name.toLowerCase()));
  if (matches.length > 0) {
    matches.forEach(a => {
      console.log(`  ✓ "${a.name}" — bp:${a.beatportId}, ${a.totalPoints} pts, ${a.genres.length} genres, ${a.tracksByGenre ? Object.keys(a.tracksByGenre).length : 0} genre-tracks, ${a.labelsPublishedOn.length} labels`);
      if (a.labelsPublishedOn.length > 0) {
        console.log(`    Labels: ${a.labelsPublishedOn.slice(0, 5).join(', ')}${a.labelsPublishedOn.length > 5 ? ` (+${a.labelsPublishedOn.length - 5} more)` : ''}`);
      }
    });
  } else {
    console.log(`  ✗ "${name}" not in current top-100`);
  }
});

console.log('\n=== TRACKS ===');
console.log('Total tracks:', data.tracks.length);
console.log('Sample track (first):');
console.log(JSON.stringify(data.tracks[0], null, 2).split('\n').slice(0, 25).join('\n'));

// Cross-genre tracks
const crossGenreTracks = data.tracks.filter(t => t.positions.length > 1);
console.log(`\nCross-genre tracks (same track in multiple genres): ${crossGenreTracks.length}`);
console.log('Examples:');
crossGenreTracks.slice(0, 5).forEach(t => {
  console.log(`  "${t.name}" (${t.mixName}) — ${t.artists.map(a => a.name).join(' + ')} — appears in ${t.positions.length} genres:`);
  t.positions.forEach(p => console.log(`    ${p.genre}: #${p.position} (${p.points} pts)`));
});

// Stats
console.log('\n=== STATS ===');
const artistsWithTracks = data.artists.filter(a => Object.keys(a.tracksByGenre || {}).length > 0);
const remixersOnly = data.artists.filter(a => a.isRemixerOnly);
console.log(`Artists with tracks (primary): ${artistsWithTracks.length}`);
console.log(`Remixers-only artists: ${remixersOnly.length}`);
console.log(`Trending artists: ${data.artists.filter(a => a.trending).length}`);

// Label stats
const labelsWithSlug = data.labels.filter(l => l.slug);
const labelsWithImage = data.labels.filter(l => l.imageUrl);
console.log(`\nLabels with slug: ${labelsWithSlug.length}/${data.labels.length}`);
console.log(`Labels with image: ${labelsWithImage.length}/${data.labels.length}`);

// Genres list
console.log('\n=== GENRES ===');
console.log(`Total: ${data.genres.length}`);
data.genres.forEach(g => console.log(`  - ${g}`));

// File size & per-artist avg tracks
const avgTracksPerArtist = artistsWithTracks.length > 0
  ? (artistsWithTracks.reduce((sum, a) => sum + Object.values(a.tracksByGenre).reduce((s, ts) => s + ts.length, 0), 0) / artistsWithTracks.length).toFixed(2)
  : 0;
console.log(`\nAvg tracks per active artist: ${avgTracksPerArtist}`);

// Save a summary
const summary = {
  meta: data._meta,
  topArtists: [...data.artists].sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 20).map(a => ({
    name: a.name,
    totalPoints: a.totalPoints,
    genresCount: a.genres.length,
    labelsCount: a.labelsPublishedOn.length,
    bestPosition: a.bestPosition,
    trending: a.trending,
    labels: a.labelsPublishedOn,
  })),
  topLabels: [...data.labels].sort((a, b) =>
    (Object.values(b.pointsByGenre || {}).reduce((s, p) => s + p, 0)) -
    (Object.values(a.pointsByGenre || {}).reduce((s, p) => s + p, 0))
  ).slice(0, 20).map(l => ({
    name: l.name,
    genres: l.genres,
    totalPoints: Object.values(l.pointsByGenre || {}).reduce((s, p) => s + p, 0),
  })),
  crossGenreTracksCount: crossGenreTracks.length,
  stats: {
    avgTracksPerArtist: parseFloat(avgTracksPerArtist),
    remixersOnly: remixersOnly.length,
    trendingArtists: data.artists.filter(a => a.trending).length,
    labelsWithSlug: labelsWithSlug.length,
    labelsWithImage: labelsWithImage.length,
  }
};
fs.writeFileSync('/home/z/my-project/download/scraper-v2-analysis.json', JSON.stringify(summary, null, 2));
console.log('\n=== Summary saved to /home/z/my-project/download/scraper-v2-analysis.json ===');
