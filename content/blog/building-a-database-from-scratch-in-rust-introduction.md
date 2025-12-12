+++
title = "Building a Database From Scratch in Rust"
date = 2025-08-25
[taxonomies]
tags = ["New Series", "Rust", "Database"]
[extra]
reading_time = 2
+++

Welcome to my first blog series where I will talk about the development of jdb (until I think of a better name), a database I am writing from scratch in Rust. You might be asking yourselves why? And I ask back, why not?

The main goal of this project is to deepen my understanding of databases (further than reading database internals and going over other projects) and of Rust, a language I like.

To start, this database will not be anything special, but as I go along I might insert some of my own ideas to make it unique.

My roadmap (at least for now the parts might change as I continue development) is as follows:

*Parts 1-3: The Storage Layer*
- Pages and the slotted page design
- File management and page persistence
- Records and serialization
- Data types and schemas
- Heap files

*Parts 4-5: Memory Management*
- Buffer pool and page caching
- Clock replacement algorithm
- Write-ahead Logging (WAL)
- Basic crash recovery

*Parts 6-8: Indexing*
- B+ tree implementation
- Index scans and range queries
- Unique and non-unique indices
- Index-organized tables

*Parts 8-11: SQL*
- SQL parser
- Query planning and optimization
- Logical and phyical plan
- Basic operators (scan, filter, join)
- Aggregations and sorting

*Parts 12-14: Network Layer*
- TCP server using Tokio
- Custom wire protocol
- Message framing and serialization
- Connection handling and multiplexing

*Parts 15-16: Client*
- Rust client crate
- CLI
- Authentication and sessions
- Error handling and retries

*Future parts:*
- Transactions
- Advanced features (query caching, replication, backup)
- I also want to include a feature where you can write python (or another language) in the query