# The self-roast post

Every post so far has been "look what I did." LinkedIn has clocked that shape and
is throttling it, which is why the last three underperformed regardless of how
they were written. This is the first post in a different genre.

It only works because of the turn in the middle: the list is not an apology, it
is evidence. People who ship have bug lists. People who talk do not.

Numbers used, all checked today: 17 releases (0.1.72 to 0.1.89), 463 tests
(253 Rust, 210 JS), 235 tests at the time of the YC post two weeks ago.

Post around 08:00 or 19:30 Stockholm. Link in the first comment, not the post.

---

a stranger found out my app is signed with my mum's apple account and told me in
the comments.

he ran a command line tool against my background items, screenshotted it, and
posted "why does this say JESSICA IVANA LILJA"

that's my mum. i'm 18. i used her developer account because i did not have the
$99. he was also completely right about how to fix it, which is somehow the
worse part.

i shipped 17 versions in two days. here is everything else i broke.

the download form on mobile saved your email and sent you absolutely nothing. it
said the link was on its way. it was not on its way. one person asked for my app
and got silence, and i only found out because i went digging in the database
myself.

my website spent a week showing a demo of an interface my app no longer has.

i wrote css for three cloud layers that were never on the page. styling elements
that do not exist. i thought the clouds looked bad. the clouds were imaginary.

my demo video had a cursor that clicked a conversation that was already
selected, so it looked like the product had lost its mind. it had not. i had.

all of it is fixed. all of it is live right now.

here is the part yall are not going to like.

you can only have a list like this if you ship. every single one of those bugs
exists because something real went out to real people. you cannot break a mobile
email form you never built. you cannot ship an interface a week out of date if
you have never shipped an interface.

half of yall have "building in public" in your headline and have never once said
what broke. not because nothing broke. because nothing shipped.

235 tests when i applied to YC two weeks ago. 463 today. rust, native mac app,
still nothing uploaded, your conversations still never leave your machine.

i broke every one of those myself in two days and fixed every one of them
myself in two days, in my bedroom, in stockholm.

post your bug list. i'll wait.
