+++
title = "Building a Database From Scratch - Storage Layer Page Design"
date = 2025-08-26
[taxonomies]
tags = ["Rust", "Database"]
+++

## The Storage Layer

Kicking off this series, we begin with the **Storage Layer** - the part of the database responsible for storing the data on disk, indexing, and everything else related.

Have you ever wondered how are your records being stored? what does a row mean to the computer? is everything on RAM? on disk? how is it more efficient than just storing the raw data on files?

in this blog piece I will dive into the interface between raw data on files (Binary) and actual records and tables the basic unit of this interface is called a **Page**.

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
What is the size of these fixed sized blocks? it can be anything we want but to levarage the operating system memory reading we need a number that is a power of 2 ideally between 4 and 16 KB. 

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
- Used by many successfull databases like PostgreSQL
- Works well with most operating and file systems
- I can easily change it later so no reason to waste time right now 

## Page Anatomy
what are the components of a page?
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
- Data - pretty self explanatory but these pages actually hold regular records (the only type we'll focus in this blog)
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
Slotted page is a type of page architecture that brings flexibility and time efficiency letting you add variable sized records without worrying about where should they go in the page. imagine we just add variable sized records to a page the first one is easy to add

```
| ------- 8KB ------- | // an empty page
| R1 ---- | 7.85KB ----- | // 1 record
```
now to add another record we need to find where the first record ends which sounds simple but once we need to add more records each action will require us to iterate over all the pages for each one find where it ends and move to the next one 
```
| -R1- --R2-- -----R3----- -R4- | // variable sized records
```
to fetch R3 we need to find where it starts which is where R2 ends and the size of R3 but to find where R2 ends we need to find where it starts and its size and to find where R2 starts we need to find where R1 ends suddenly this simple operation requires us to go over the entire page. 
the slotted page design comes to solve this issue while records are being added from the start of the page towards the end for each record we add a slot (from the end towards the start)
```
| -R1- -R2- ----- S2 S1 |
```
slots are fixed size and they contain information about the record, since they are fixed sized its easy to locate slot number X with pointer arithmetics 
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
note: there is a logical proof of safety (which is recommended for any unsafe use) in the github repo, this is possible to do without the use of unsafe but will impact performace and code complexity.

once we got the slot we know the record location and size 
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