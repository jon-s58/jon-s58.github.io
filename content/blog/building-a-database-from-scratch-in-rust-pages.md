+++
title = "Building a Database From Scratch in Rust: Pages and Page Design"
date = 2025-08-26
[taxonomies]
tags = ["Rust", "Database", "Storage"]
+++

When I started sketching out a storage layer for this side project, a basic question loomed: *how do you store variable‑sized records while only reading and writing fixed‑size chunks from disk?*  The common solution, used in most production systems, is the **slotted page**.

## Why Pages?

Disks and operating systems like to work with blocks of data. Reading 8KB at a time is far cheaper than chasing a dozen tiny records scattered across the drive. So the database batches work into fixed‑size **pages** that can be cached, written, and checksummed as units.  In this project I settled on a page size of `8192` bytes—large enough to hold a pile of records, small enough to move around quickly, and a nice power of two for pointer math.

## Anatomy of a Page

A page is more than a byte array. The first 64 bytes are a header that gives the rest of the system a map of what's inside:

```rust
pub struct PageHeader {
    pub page_id: u32,
    pub page_type: PageType,
    pub free_space_start: u16,
    pub free_space_end: u16,
    pub slot_count: u16,
    // ... plus LSN, checksum, and some reserved bytes
}
```

This header answers a few crucial questions:

* **What page am I looking at?**  `page_id` and `page_type` let higher layers route operations appropriately.
* **Where can new bytes go?**  `free_space_start` and `free_space_end` mark the boundaries of the unused region.
* **How many records live here?**  `slot_count` tells the iterator how many entries to scan.

Notice that `free_space_start` never moves in this version of the code—it always stays right after the header.  Records are packed from the end of the page downward, so only `free_space_end` needs to change.

## Slotting Records

Instead of writing records sequentially after the header, we keep an array of **slot entries**.  Each slot takes four bytes—two for the offset of a record and two for its length:

```rust
pub struct SlotEntry {
    pub offset: u16,
    pub length: u16,
}
```

Slots grow upward from the header while records grow downward from the tail of the page.  Inserting a record copies its bytes into the free space at the end, writes a slot near the front, and bumps `slot_count` and `free_space_end`.  Deleting simply zeroes the slot’s length; the bytes remain until compaction.

## Fragmentation and Compaction

Leaving dead bytes behind makes future inserts trickier, so the page tracks how many slots have length zero.  When more than 20 % of them are dead—and at least two—we rewrite the page in place.  Live records are copied toward the end, slots are updated, and `free_space_end` slides forward to reclaim space.

```rust
pub fn should_compact(&self) -> bool {
    let total_slots = self.header().slot_count as usize;
    let deleted = self.deleted_count();
    deleted >= 2 && (deleted * 100 / total_slots) > 20
}
```

Compaction walks slots in order, moving each live record toward the page’s tail.  Doing it in-place means no extra allocation and keeps offsets small enough for `u16`.

## Safety Nets

Two small helpers keep the page reliable and pleasant to use:

* **Checksums** – `update_checksum` computes a CRC32 over the whole page (excluding the checksum field).  `verify_checksum` re-runs the calculation when a page is read and spots any bit‑rot.
* **Iterators** – `iter()` yields only live records, so higher layers don’t have to worry about deleted slots.

## Why This Design?

Slotted pages hit a sweet spot: variable‑length records without constant rewrites, cheap deletes, and the ability to defragment when things get messy.  The header keeps metadata compact, the slot array avoids shifting data on every insert, and 8KB aligns nicely with hardware.  It’s a simple, battle‑tested blueprint for the layers to come.

Next time we’ll talk about how these pages travel to and from disk.  For now, the database finally has a home: tidy little 8 KB envelopes with a map at the front and records packed snugly in the back.


