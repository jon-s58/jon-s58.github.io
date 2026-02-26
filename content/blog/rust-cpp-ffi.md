+++
title = "Rust C++ FFI"
date = 2026-02-26
[taxonomies]
tags = ["Standalone", "Rust", "C++", "FFI"]
[extra]
reading_time = 5
+++
Notes from tinkering with C++ FFI in Rust.
<!-- more -->

Recently I've been working on a project (more on that in future blogs) that involves OpenCASCADE (OCCT) and knowing that building this project in C++ would have taken me forever, I decided to look at my options (assuming I go with Rust for this project and it is suitable):
- Using a native Rust crate
- Manually porting parts that I need and rewriting them in Rust
- Finding a way to call the functions I need from Rust

The Rust crates didn't cover my current need and future expansion and rewriting the code seems like an interesting project but that means I'll have to dive deep into OCCT more than I am interested in doing for now. That means my best option is to try FFI so I started looking online.
I've read a few online resources including the Rustonomicon chapter about FFI and encountered CXX — "safe interop between Rust and C++", went over their core concepts and tutorial, and made a decision.
I must say it was surprisingly simple to use. I created a new crate looking like this:
```
ffi/
-- cpp/
-- -- bridge.h 
-- -- bridge.cc
-- src/
-- -- lib.rs
-- build.rs
-- Cargo.toml
```
On the C++ side of things I included the `rust/cxx.h` header and declared the unique C++ structs and functions in the header file. Note that if there are shared structs between Rust and C++ we declare them in Rust with the fields, but in C++ we just declare their existence. For example:
```rust
// lib.rs - Rust side declaration, inside #[cxx::bridge] mod ffi
struct ShapeInfo {
        num_faces: i32,
        num_edges: i32,
        num_vertices: i32,
    }
```
```cpp
// bridge.h - C++ side declaration
struct ShapeInfo;
```

And then it can be used like this
```cpp
ShapeInfo count_topology(const TopoDS_Shape& shape) {
    ShapeInfo info;
    info.num_faces = 0;
    info.num_edges = 0;
    info.num_vertices = 0;
    ...
    return info;
}
```

Now working with a struct that is defined in C++ with functions in C++ and making it part of your Rust code is a little more complex but still pretty simple. For example, my core struct is Shape and I want to be able to use it like `shape.info()`, but Shape is a structure from C++ and get_shape_info is a C++ function. What do I do?
First, we need to define a wrapper to the C++ struct, in our case it's the OCCT `TopoDS_Shape`. 
```rust
#[cxx::bridge]
mod ffi {
    unsafe extern "C++" {
        include!("cad-ffi/cpp/bridge.h");

        /// Opaque wrapper for TopoDS_Shape.
        /// Allows Rust to own the shape lifetime via UniquePtr.
        type ShapeWrapper;

        fn get_shape_info(wrapper: &ShapeWrapper) -> ShapeInfo;
    }
}
```
You might have noticed we are using ShapeInfo which is defined outside of the `unsafe extern "C++"` directly under `mod ffi`, which means both Rust and C++ know the struct fields. Now we have the `ShapeWrapper` struct but no functions that belong to it. Since it's a C++ struct we only have functions that receive it as an input. To use it more like a Rust struct, we need to wrap it again, and this time in a unique pointer that lets Rust own the shape lifetime
```rust
pub struct Shape {
    inner: cxx::UniquePtr<ffi::ShapeWrapper>,
}
```
And then we can define functions that belong to this struct
```rust
impl Shape {
    pub fn info(&self) -> ShapeInfo {
        return ffi::get_shape_info(&self.inner)
        }
}
```
Now we do need to define `get_shape_info` in C++ both in the header file and actually implement it, and for that we also need to implement the `ShapeWrapper` struct which wraps the `TopoDS_Shape` in C++ since the original Shape struct from OCCT is a bit complex to use
```cpp
// bridge.h
class ShapeWrapper {
public:
    // Use a pointer to avoid including TopoDS_Shape.hxx in header
    void* shape_ptr;

    ShapeWrapper();
    ~ShapeWrapper();

};

ShapeInfo get_shape_info(const ShapeWrapper& wrapper);
```
```cpp
// bridge.cc
// Get shape topology info
ShapeInfo get_shape_info(const ShapeWrapper& wrapper) {
    const TopoDS_Shape& shape = get_shape(wrapper);

    if (shape.IsNull()) {
        ShapeInfo info;
        info.num_faces = 0;
        info.num_edges = 0;
        info.num_vertices = 0;
        return info;
    }

    return count_topology(shape);
}
```
And now we have a struct and a function that belongs to it in Rust that behind the scenes calls C++ code, and the use of it is as simple as `my_shape.info()`.

The last thing we need to do is to tell Cargo how to build this project. Since it's not only Rust, we need to add a `build.rs` file next to `Cargo.toml`
```rust
// build.rs
fn main() {
    // This is OCCT specific and depends on how you want to link the packages you use
    let (include_dir, lib_dir) = find_occt();

    cxx_build::bridge("src/lib.rs")
        .file("cpp/bridge.cc")
        .include(&include_dir)
        .flag_if_supported("-std=c++17")
        .compile("cad_ffi_bridge");
}
```

Finally, we can run `cargo build` and our project is compiled!
Interested in using C++ with Rust? Go to the [CXX docs](https://cxx.rs/index.html) and follow along.
This blog is a taste of my experience using C++ with Rust in the same project. In future blogs I will dive deeper into this and also into the project I am working on.