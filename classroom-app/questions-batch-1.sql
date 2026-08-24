-- =================================================================
-- Batch 1: first 20 questions from 2017 General Paper
-- Source stripped of school name. Answers/explanations drafted by
-- Claude since the source PDF has no answer key — spot-check before
-- treating these as final, especially any you're unsure of.
-- Run in Supabase → SQL Editor.
-- =================================================================

insert into questions (subject_id, question, options, correct_index, explanation) values

-- Social Studies
('social-studies', 'Nigeria is situated in the ________ of Africa.',
 '["East", "West", "North", "South", "Central"]', 1,
 'Nigeria is a West African country, bordered by Benin, Niger, Chad, and Cameroon.'),

('social-studies', 'The first Nigerian to win the Nobel Prize for Literature is _______.',
 '["Professor Wole Soyinka", "Professor Ambrose Ali", "Professor Babatunde Fafunwa", "Professor Jibril Aminu", "Professor Chinua Achebe"]', 0,
 'Wole Soyinka won the Nobel Prize in Literature in 1986, the first African to do so.'),

('social-studies', 'Who was the slave boy who later became the first African Bishop?',
 '["Lord Steven", "Bishop Shawcross", "Bishop Abayomi", "Bishop Okorie", "Bishop Ajayi Crowther"]', 4,
 'Samuel Ajayi Crowther was freed from slavery and later became the first African Anglican Bishop.'),

('social-studies', 'Which of these women fought against the killing of twins?',
 '["Mary Slessor", "Mary Magdalen", "Mary Anne", "Mary Jones", "Virgin Mary"]', 0,
 'Mary Slessor was a Scottish missionary in Calabar known for ending the practice of killing twins.'),

('social-studies', 'Which of these countries has French as her official language?',
 '["Liberia", "Cameroun", "Algeria", "Ghana", "Egypt"]', 1,
 'Cameroon has both French and English as official languages, a legacy of British and French colonial rule.'),

('social-studies', 'The mass media does not include one of these.',
 '["Radio", "Notebook", "Magazine", "Newspaper", "Television"]', 1,
 'A notebook is a personal writing tool, not a channel for mass communication.'),

('social-studies', 'Barack Obama, the 44th U.S.A. president is a descendant of which of these African countries?',
 '["Libya", "Liberia", "Kenya", "Ghana", "Egypt"]', 2,
 'Barack Obama''s father was Kenyan, from the Luo ethnic group.'),

('social-studies', 'Which of these is the world Soccer Ruling Body?',
 '["NFA", "NFL", "EPL", "UEFA", "FIFA"]', 4,
 'FIFA (Fédération Internationale de Football Association) governs football globally.'),

('social-studies', 'Which of these countries in Africa was noted for its Apartheid Policy?',
 '["South Africa", "Cameroun", "Zambia", "Nigeria", "Libya"]', 0,
 'South Africa enforced Apartheid, a system of racial segregation, from 1948 to the early 1990s.'),

('social-studies', 'In what year were the Southern and Northern Protectorates of Nigeria amalgamated?',
 '["1922", "1907", "1960", "1957", "1914"]', 4,
 'Lord Lugard amalgamated the Southern and Northern Protectorates in 1914 to form modern-day Nigeria.'),

-- Civic Education
('civic-ed', 'How many colours are there in the Nigerian flag?',
 '["Three", "Two", "Five", "Four", "Six"]', 1,
 'The Nigerian flag has two colours — green and white — arranged in a green-white-green pattern.'),

('civic-ed', 'How old will The Federal Republic of Nigeria be when it celebrates her independence this year?',
 '["55", "56", "2017", "2018", "57"]', 4,
 'Nigeria gained independence in 1960; by 2017 that is 57 years.'),

('civic-ed', 'A person who is a legal member of a country is called ________.',
 '["an alien", "a patriot", "a citizen", "a resident", "a nationalist"]', 2,
 'A citizen is a person legally recognised as belonging to a particular country, with rights and duties there.'),

('civic-ed', 'The government of the people by the people is known as _______.',
 '["democracy", "aristocracy", "oligarchy", "monarchy", "theocracy"]', 0,
 'Democracy is government of the people, by the people, and for the people.'),

('civic-ed', 'Under what party did President Buhari win the last presidential election?',
 '["A.P.C", "P.D.P.", "A.D.", "A.P.G.A.", "Fresh Party"]', 0,
 'Muhammadu Buhari won the 2015 Nigerian presidential election under the All Progressives Congress (APC).'),

('civic-ed', 'What is full meaning of UNO?',
 '["Union Nations Organization", "United Nations Order", "United Nigeria Organization", "United Nations Organization", "United National Order"]', 3,
 'UNO stands for United Nations Organization, an intergovernmental organization founded in 1945.'),

('civic-ed', 'Which of these is not an international organization?',
 '["INEC", "ECOWAS", "UN", "OPEC", "OAU"]', 0,
 'INEC (Independent National Electoral Commission) is Nigeria''s national election body, not an international one.'),

('civic-ed', 'The picture displayed on the ten Naira note is that of ________.',
 '["Alvan Ikoku", "Murtala Muhammed", "Abubakar Tafawa Balewa", "Aliko Dangote", "Obafemi Awolowo"]', 0,
 'Alvan Ikoku, a Nigerian educationist, is featured on the ₦10 note.'),

-- Science
('science', 'Cassava is propagated by using _______.',
 '["seeds", "stem cuttings", "roots", "tubers", "shoots"]', 1,
 'Cassava is grown by planting cuttings from its woody stem, which root and sprout into new plants.'),

('science', 'Which of the following is a good extracted from palm fruit?',
 '["Garri", "Cocoyam", "Cloth", "Cocoa", "Palm oil"]', 4,
 'Palm oil is extracted from the fleshy pulp of the palm fruit.');
