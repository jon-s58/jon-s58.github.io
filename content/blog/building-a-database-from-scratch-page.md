+++
title = "Building a Database From Scratch - Storage Layer Page Design"
date = 2025-12-11
[taxonomies]
tags = ["Rust", "Database", "Storage Layer"]
+++

## The Storage Layer

Kicking off this series, we begin with the **Storage Layer** - the part of the database responsible for storing the data on disk, indexing, and everything else related.

Have you ever wondered how your records are being stored? What does a row mean to the computer? Is everything on RAM? On disk? How is it more efficient than just storing the raw data on files?

In this blog piece I will dive into the interface between raw data on files (binary) and actual records and tables. The basic unit of this interface is called a **Page**.

## What are Pages?

The basic unit of the storage layer is the **Page**. What are pages and why do they matter?

Databases usually don't read/write individual bytes - they work with **fixed-size blocks** because operating systems and hardware are optimized for block I/O. Pages are an implementation of these blocks.

### Why Pages Matter

Pages provide:
- **Efficient disk I/O** - The cost of reading a single byte is almost the same as reading 4-8KB
- **Better cache locality** - Data that's accessed together stays together
- **Simplified buffer management** - Fixed-size chunks are easier to manage in memory
- **Atomic write units** - Essential for crash recovery

## Choosing the Right Page Size
What is the size of these fixed sized blocks? It can be anything we want but to leverage the operating system memory reading we need a number that is a power of 2 ideally between 4 and 16 KB. 

Different databases have made different choices:
- **PostgreSQL**: 8KB
- **MySQL InnoDB**: 16KB  
- **SQLite**: 4KB (default)

### Trade-offs

**Larger pages:**
- Better sequential scan performance
- Fewer I/O operations
- Can waste space for small records

**Smaller pages:**
- Less wasted space
- Better for random access patterns
- More I/O operations needed

### My Choice: 8KB

I chose **8KB** because:
- Used by many successful databases like PostgreSQL
- Works well with most operating and file systems
- I can easily change it later so no reason to waste time right now 

## Page Anatomy
What are the components of a page?
### The Page Header
Header is a section in the beginning of each page holding relevant data about the records inside it, data integrity, free space, and in the future more features for recovery, transactions, and more.

```Rust
pub struct PageHeader {
    pub page_id: u32,          // Unique page identifier
    pub page_type: PageType,   // Data, Index, Overflow, or Free
    pub free_space_start: u16, // Where slot array ends
    pub free_space_end: u16,   // Where record data begins
    pub slot_count: u16,       // Number of slots
    //pub lsn: u64,              // will be explained in future blogs
    pub checksum: u32,         // Data integrity check
}
```

The page types are as follows:
- Data - pretty self explanatory but these pages actually hold regular records (the only type we'll focus on in this blog)
- Index - these form the internal nodes of the B/B+ Tree Index
```
         [Index Page]
        /     |      \
   [Index] [Index] [Index]    <- More index pages
      |       |       |
   [Data]  [Data]  [Data]      <- Leaf level (data pages)
```
- Overflow - when we have a record that is too big to fit in a page we use the Overflow page for it, Overflow pages can be chained together to hold large values/records.
- Free - unused pages available for allocation, usually deleted pages which can then be later used for space reclamation.

### The Slotted Page Design (Data Page)
Important Note: for now records are just an array of bytes (raw data).

Slotted page is a type of page architecture that brings flexibility and time efficiency letting you add variable sized records without worrying about where they should go in the page. Imagine we just add variable sized records to a page - the first one is easy to add

```
| ------- 8KB ------- | // an empty page
| R1 ---- | 7.85KB ----- | // 1 record
```
Now to add another record we need to find where the first record ends which sounds simple but once we need to add more records each action will require us to iterate over all the records for each one, find where it ends and move to the next one 
```
| -R1- --R2-- -----R3----- -R4- | // variable sized records
```
To fetch R3 we need to find where it starts which is where R2 ends and the size of R3, but to find where R2 ends we need to find where it starts and its size, and to find where R2 starts we need to find where R1 ends. Suddenly this simple operation requires us to go over the entire page.
The slotted page design comes to solve this issue - records are being added from the end of the page towards the start and for each record we add a slot (from the start towards the end)
```
| -S1- -S2- ----- R2 R1 |
```
```
┌─────────────────────────────────────────────────────────────────┐
│ Header (64 bytes)                                               │
├─────────────────────────────────────────────────────────────────┤
│ Slot Array (grows →)                                            │
│ [Slot 0][Slot 1][Slot 2]...                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                    FREE SPACE                                   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Records (← grows backward from end)                             │
│ ...][Record 2][Record 1][Record 0]                              │
└─────────────────────────────────────────────────────────────────┘
```
Slots are fixed size and they contain information about the record. Since they are fixed sized it's easy to locate slot number X with pointer arithmetic 
```rust
pub fn get_slot(&self, index: usize) -> Option<SlotEntry> {
        if index >= self.header().slot_count as usize {
            return None;
        }

        let slot_offset = Self::HEADER_SIZE + (index * Self::SLOT_SIZE);
        if slot_offset + Self::SLOT_SIZE > PAGE_SIZE {
            return None;
        }
        unsafe {
            Some(*(self.data.as_ptr().add(slot_offset) as *const SlotEntry))
        }
    }
```
Note: there is a logical proof of safety (which is recommended for any unsafe use) in the GitHub repo. This is possible to do without the use of unsafe but will impact performance and code complexity.

Once we got the slot we know the record location and size 
```rust
pub struct SlotEntry {
    pub offset: u16, // 2 bytes - offset from start of page
    pub length: u16, // 2 bytes - length of record
}
```
which makes it easy to fetch the record
```rust
pub fn get_record(&self, slot_index: usize) -> Option<&[u8]> {
        let slot = self.get_slot(slot_index)?;

        if slot.length == 0 {
            return None; // Deleted record
        }

        let start = slot.offset as usize;
        let end = start + slot.length as usize;

        if end <= PAGE_SIZE {
            Some(&self.data[start..end])
        } else {
            None
        }
    }
```

### Deletion and Compaction
Now that we know how pages are built, what happens when we delete a record?
The act of deleting a record is simple - we just mark the slot as deleted and not actually remove it and reclaim the space since this is a costly action to do. We should avoid reclaiming small amounts of space and only do this action when we have a meaningful amount to reclaim. 
```rust
pub fn delete_record(&mut self, slot_index: usize) -> bool {
        if let Some(mut slot) = self.get_slot(slot_index) {
            slot.length = 0;
            self.set_slot(slot_index, slot);
            // Note: We don't reclaim space yet - that would require compaction
            true
        } else {
            false
        }
    }
 ```
We just set the slot length to 0 which marks a deleted record. The data itself still exists but we ignore it since we actually know all the existing records and how to fetch them.

Now the question is when to compact? The answer is complicated. First, I'd like to make this customizable in the future since what works for one is not the solution for another. Second, to find an optimal number of when to compact we need a lot of usage to get statistics from, so for now I just picked 20% of the page size and at least 2 deleted records. 
```rust
pub fn should_compact(&self) -> bool {
        let total_slots = self.header().slot_count as usize;

        // Don't compact empty pages or pages with very few slots
        if total_slots <= 1 {
            return false;
        }

        let deleted = self.deleted_count();

        // Need at least 2 deleted slots AND > 20% deleted
        deleted >= 2 && (deleted * 100 / total_slots) > 20
    }
```
The actual compaction is a process where we move the slots towards the end of the page and the records towards the beginning of it, overwriting the deleted ones. 
```rust
pub fn compact(&mut self) {
        if !self.should_compact() {
            return;
        }

        let old_slot_count = self.header().slot_count as usize;
        let mut write_position = PAGE_SIZE;
        let mut write_slot_index = 0;

        // Two-pass in-place compaction
        for read_slot_index in 0..old_slot_count {
            if let Some(slot) = self.get_slot(read_slot_index) {
                if slot.length > 0 {  // Active slot
                    let record_len = slot.length as usize;
                    let old_start = slot.offset as usize;
                    let old_end = old_start + record_len;

                    // Calculate new position for record (growing backwards from end)
                    let new_start = write_position - record_len;

                    // Move record data if needed
                    if new_start != old_start {
                        self.data.copy_within(old_start..old_end, new_start);
                    }

                    // Always write the compacted slot (simpler, clearer)
                    self.set_slot(write_slot_index, SlotEntry {
                        offset: new_start as u16,
                        length: slot.length,
                    });

                    write_position = new_start;
                    write_slot_index += 1;
                }
            }
        }

        // Update header with new counts and free space boundary
        let header = self.header_mut();
        header.free_space_end = write_position as u16;
        header.slot_count = write_slot_index as u16;  // Only active slots
    }
```
Let's walk through this compaction algorithm.

Before compaction our page looks like
```
       Slot Array                              Records Area
┌───┬───┬───┬───┬───┐                    ┌───────────────────────┐
│ 0 │ 1 │ 2 │ 3 │ 4 │                    │...][E][D][C][B][A]    │
│ptr│DEL│ptr│DEL│ptr│                    │   ↑     ↑     ↑       │
└─┬─┴───┴─┬─┴───┴─┬─┘                    │   │     │     │       │
  │       │       │                      │   │     │     └── Slot 0 points here
  │       │       └──────────────────────┼───┼─────┘
  │       └──────────────────────────────┼───┘
  └──────────────────────────────────────┘

Fragmentation: Records B and D are orphaned (slots deleted)
```
Let's break the algorithm into steps
```
Pass through slots 0-4:

Slot 0 (active "A"):  Move to end        → write_position = PAGE_SIZE - 5
Slot 1 (deleted):     Skip
Slot 2 (active "C"):  Move next          → write_position -= len(C)
Slot 3 (deleted):     Skip  
Slot 4 (active "E"):  Move next          → write_position -= len(E)

Rewrite slot array with only active slots (indices 0, 1, 2)
```
Now after compaction let's visualize the page again
```
       Slot Array                              Records Area
┌───┬───┬───┐                            ┌───────────────────────┐
│ 0 │ 1 │ 2 │                            │         ][E][C][A]    │
│ptr│ptr│ptr│                            │           ↑  ↑  ↑     │
└─┬─┴─┬─┴─┬─┘                            │           │  │  │     │
  │   │   └──────────────────────────────┼───────────┼──┼──┘
  │   └──────────────────────────────────┼───────────┼──┘
  └──────────────────────────────────────┼───────────┘
                                         │
                              free_space_end (more free space!)
```
Now we are left with 3 records and slots, everything is continuous with no fragmentation and we reclaimed the unused space of deleted records. 

That's it! We are almost finished with the Page unit of this database. All that's left is implementing an iterator which I promise is less complex than what we've been through. 
### Iterators
In Rust an iterator is an object that implements the `Iterator` trait
```Rust
pub trait Iterator {
    type Item;

    // Required method
    fn next(&mut self) -> Option<Self::Item>;

    ... 75 more methods
}
```
With the goal of iterating over another object, so for that we create the `PageIterator`
```Rust
pub struct PageIterator<'a> {
    page: &'a Page,
    current_slot: usize,
}
```
Now let's implement the `Iterator` trait with the required function to get the next item
```rust
impl<'a> Iterator for PageIterator<'a> {
    type Item = &'a [u8];

    fn next(&mut self) -> Option<Self::Item> {
        while self.current_slot < self.page.header().slot_count as usize {
            let slot_index = self.current_slot;
            self.current_slot += 1;

            if let Some(record) = self.page.get_record(slot_index) {
                return Some(record);
            }
        }
        None
    }
}
```
Now we're halfway there. The only thing required from us is a way to turn the `Page` into a `PageIterator`
```Rust
impl Page {
   pub fn iter(&self) -> PageIterator {
        PageIterator {
            page: self,
            current_slot: 0,
        }
    }
}
```
As simple as that!

And that's it y'all! With the first practical part of this blog series where we covered the very basics of the storage layer - the Page. In the next entries we will go over file storage, indexing, records and a lot more so stay tuned and see you soon!