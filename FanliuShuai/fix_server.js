const fs = require('fs');
let c = fs.readFileSync('/home/simon/nebs-exam/server.js', 'utf8');

// Add question_text to CREATE TABLE
c = c.replace(
  "  img_url TEXT,\n    choices TEXT,",
  "  img_url TEXT,\n    question_text TEXT,\n    choices TEXT,"
);

// Add question_text to INSERT
c = c.replace(
  "const insert = db.prepare(`INSERT INTO questions (id, exam_id, order_idx, img_url, choices, correct_answer, explanation)\n                              VALUES (?, ?, ?, ?, ?, ?, ?)`);",
  "const insert = db.prepare(`INSERT INTO questions (id, exam_id, order_idx, img_url, question_text, choices, correct_answer, explanation)\n                              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);",
);

// Fix the insertMany to pass question_text
c = c.replace(
  "      insert.run(uuid(), req.params.exam_id, i, q.img_url || null,\n                 JSON.stringify(q.choices || []), q.correct_answer ?? 0, q.explanation || null);",
  "      insert.run(uuid(), req.params.exam_id, i, q.img_url || null, q.question_text || null,\n                 JSON.stringify(q.choices || []), q.correct_answer ?? 0, q.explanation || null);"
);

fs.writeFileSync('/home/simon/nebs-exam/server.js', c);
console.log('server.js updated');