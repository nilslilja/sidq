# LinkedIn: the /dev/urandom post (2026-09-10)

> **Mechanics:** one image — the jetsam log or the one-line diff. Link in the
> FIRST comment, never the body. Post 08:00 or 19:30 Stockholm. Reply to every
> comment in the first hour; that is what carried both 20k posts.
>
> **The one call to make before posting:** the second half admits a billing bug
> existed. Nobody was affected and it is fixed. I think the credibility is worth
> more than the doubt, but cutting from "while i was in there" to "this is what
> building alone actually looks like" leaves a working post.

---

I WROTE ONE LINE OF CODE THAT ATE 18 GIGABYTES AND KILLED MY MAC THREE TIMES

not a memory leak. not an infinite loop. one line, doing exactly what the documentation says it does.

fs::read("/dev/urandom")

i needed sixteen random bytes for an id. that function reads a file to the end. /dev/urandom does not have an end.

so it read. and the buffer doubled. and macos killed it at 10.8 gigabytes. then at 11.1. then at 18.9, on a machine with eight.

i spent the whole evening blaming my ai for it. clearing chats, restarting, watching activity monitor like it owed me money. it was me. it was always me. it was sitting in a file i had written that afternoon.

the fix is four characters longer than the bug.

while i was in there i found something worse. my database has never once allowed the word "team" in the column that stores which plan you are on. i have been selling a Team tier for weeks. if anybody had actually bought it, stripe would have taken their money, the write would have failed silently, and they would have sat on the free plan wondering what they paid for.

nobody bought it. that is the only reason i found out from reading my own code instead of from an email.

this is what building alone actually looks like. not the montage. one line that eats your computer, and a plan you have been selling that your own database would have rejected.

my test suite used to not finish. it finishes now.

anyway. sidq carries a whole conversation from one ai into another, on your own mac, nothing uploaded. i built it because every model i pay for forgets me and i got tired of introducing myself to computers.

it is free. i answer every comment, including the ones telling me i should have known better.

I ABSOLUTELY SHOULD HAVE KNOWN BETTER.

still shipping.
