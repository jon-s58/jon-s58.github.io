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

## Page Anatomy
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
- Data - pretty self explanatory but these pages actually hold regular records
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

### The Slotted Page Design
