# I24 LLM 软检查（关系漂移/风格偏离）- Reflection

- Outcome: I24 adds C1 relationship-drift and B4 style-deviation semantic checks through the existing Host LLM port and routes validated findings exclusively to I20's warning decision.
- Scope: no hard rejection, vector retrieval, parser, writeback, Client, persistence, or credentialed endpoint work was introduced.
- Invariant retained: the strict detector envelope permits only `soft`; kind-specific references must name disclosed C1 relationships or the disclosed B4 style profile; malformed output throws rather than passing.
- Residual risk: controlled corpus accounting does not establish live-model semantic accuracy.
- Next iteration: I25 C2 state parser, with I24 detector remaining read-only and non-blocking.
