const fs = require('fs');
let c = fs.readFileSync('/home/simon/nebs-exam/server.js', 'utf8');

// Add img_url2 to questions table
if (!c.includes('img_url2')) {
  c = c.replace(
    '  img_url TEXT,\n    question_text TEXT,',
    '  img_url TEXT,\n    img_url2 TEXT,\n    question_text TEXT,'
  );
  console.log('Added img_url2 to CREATE TABLE');
}

// Add img_url2 to INSERT
c = c.replace(
  'const insert = db.prepare(`INSERT INTO questions (id, exam_id, order_idx, img_url, question_text, choices, correct_answer, explanation)\n                              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);\n',
  'const insert = db.prepare(`INSERT INTO questions (id, exam_id, order_idx, img_url, img_url2, question_text, choices, correct_answer, explanation)\n                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);\n'
);

// Add img_url2 to insertMany
c = c.replace(
  '      insert.run(uuid(), req.params.exam_id, i, q.img_url || null, q.question_text || null,\n                 JSON.stringify(q.choices || []), q.correct_answer ?? 0, q.explanation || null);',
  '      insert.run(uuid(), req.params.exam_id, i, q.img_url || null, q.img_url2 || null, q.question_text || null,\n                 JSON.stringify(q.choices || []), q.correct_answer ?? 0, q.explanation || null);'
);

fs.writeFileSync('/home/simon/nebs-exam/server.js', c);
console.log('server.js updated');