import { useState } from 'react'

const TEMPLATES = {
    Python: [
        {
            name: "Hello World",
            icon: "👋",
            code: `print("Hello, World!")`
        },
        {
            name: "Fibonacci",
            icon: "🔢",
            code: `def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

for i in range(10):
    print(fibonacci(i))`
        },
        {
            name: "Bubble Sort",
            icon: "🔄",
            code: `def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        for j in range(0, n-i-1):
            if arr[j] > arr[j+1]:
                arr[j], arr[j+1] = arr[j+1], arr[j]
    return arr

arr = [64, 34, 25, 12, 22, 11, 90]
print(bubble_sort(arr))`
        },
        {
            name: "Class Example",
            icon: "🏗",
            code: `class Animal:
    def __init__(self, name, sound):
        self.name = name
        self.sound = sound

    def speak(self):
        return f"{self.name} says {self.sound}"

dog = Animal("Dog", "Woof")
cat = Animal("Cat", "Meow")
print(dog.speak())
print(cat.speak())`
        },
        {
            name: "File Read/Write",
            icon: "📁",
            code: `# Write to file
with open("example.txt", "w") as f:
    f.write("Hello, World!\\n")
    f.write("This is a test file.")

# Read from file
with open("example.txt", "r") as f:
    content = f.read()
    print(content)`
        },
        {
            name: "List Comprehension",
            icon: "📋",
            code: `numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

# Even numbers
evens = [x for x in numbers if x % 2 == 0]

# Squares
squares = [x**2 for x in numbers]

# Even squares
even_squares = [x**2 for x in numbers if x % 2 == 0]

print("Evens:", evens)
print("Squares:", squares)
print("Even Squares:", even_squares)`
        },
    ],
    JavaScript: [
        {
            name: "Hello World",
            icon: "👋",
            code: `console.log("Hello, World!");`
        },
        {
            name: "Arrow Functions",
            icon: "➡️",
            code: `const add = (a, b) => a + b;
const multiply = (a, b) => a * b;
const square = x => x * x;

console.log(add(5, 3));
console.log(multiply(4, 6));
console.log(square(7));`
        },
        {
            name: "Array Methods",
            icon: "📊",
            code: `const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const evens = numbers.filter(n => n % 2 === 0);
const squares = numbers.map(n => n * n);
const sum = numbers.reduce((acc, n) => acc + n, 0);

console.log("Evens:", evens);
console.log("Squares:", squares);
console.log("Sum:", sum);`
        },
        {
            name: "Async/Await",
            icon: "⏳",
            code: `const fetchData = async (url) => {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error:", error);
  }
};

fetchData("https://jsonplaceholder.typicode.com/todos/1")
  .then(data => console.log(data));`
        },
        {
            name: "Class Example",
            icon: "🏗",
            code: `class Animal {
  constructor(name, sound) {
    this.name = name;
    this.sound = sound;
  }

  speak() {
    return \`\${this.name} says \${this.sound}\`;
  }
}

class Dog extends Animal {
  constructor(name) {
    super(name, "Woof");
  }

  fetch() {
    return \`\${this.name} fetches the ball!\`;
  }
}

const dog = new Dog("Rex");
console.log(dog.speak());
console.log(dog.fetch());`
        },
    ],
    Java: [
        {
            name: "Hello World",
            icon: "👋",
            code: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}`
        },
        {
            name: "Bubble Sort",
            icon: "🔄",
            code: `public class Main {
    static void bubbleSort(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n-1; i++)
            for (int j = 0; j < n-i-1; j++)
                if (arr[j] > arr[j+1]) {
                    int temp = arr[j];
                    arr[j] = arr[j+1];
                    arr[j+1] = temp;
                }
    }

    public static void main(String[] args) {
        int[] arr = {64, 34, 25, 12, 22, 11, 90};
        bubbleSort(arr);
        for (int x : arr)
            System.out.print(x + " ");
    }
}`
        },
        {
            name: "Class Example",
            icon: "🏗",
            code: `public class Main {
    static class Animal {
        String name;
        String sound;

        Animal(String name, String sound) {
            this.name = name;
            this.sound = sound;
        }

        String speak() {
            return name + " says " + sound;
        }
    }

    public static void main(String[] args) {
        Animal dog = new Animal("Dog", "Woof");
        Animal cat = new Animal("Cat", "Meow");
        System.out.println(dog.speak());
        System.out.println(cat.speak());
    }
}`
        },
    ],
    "C++": [
        {
            name: "Hello World",
            icon: "👋",
            code: `#include<iostream>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    return 0;
}`
        },
        {
            name: "Binary Search",
            icon: "🔍",
            code: `#include<iostream>
#include<vector>
using namespace std;

int binarySearch(vector<int>& arr, int target) {
    int left = 0, right = arr.size() - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (arr[mid] == target) return mid;
        if (arr[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}

int main() {
    vector<int> arr = {1, 3, 5, 7, 9, 11, 13};
    cout << binarySearch(arr, 7) << endl;
    return 0;
}`
        },
        {
            name: "Linked List",
            icon: "🔗",
            code: `#include<iostream>
using namespace std;

struct Node {
    int data;
    Node* next;
    Node(int val) : data(val), next(nullptr) {}
};

void printList(Node* head) {
    while (head) {
        cout << head->data << " -> ";
        head = head->next;
    }
    cout << "NULL" << endl;
}

int main() {
    Node* head = new Node(1);
    head->next = new Node(2);
    head->next->next = new Node(3);
    printList(head);
    return 0;
}`
        },
    ],
    Go: [
        {
            name: "Hello World",
            icon: "👋",
            code: `package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}`
        },
        {
            name: "Goroutines",
            icon: "⚡",
            code: `package main

import (
    "fmt"
    "sync"
)

func worker(id int, wg *sync.WaitGroup) {
    defer wg.Done()
    fmt.Printf("Worker %d starting\\n", id)
    fmt.Printf("Worker %d done\\n", id)
}

func main() {
    var wg sync.WaitGroup
    for i := 1; i <= 5; i++ {
        wg.Add(1)
        go worker(i, &wg)
    }
    wg.Wait()
}`
        },
    ],
    Rust: [
        {
            name: "Hello World",
            icon: "👋",
            code: `fn main() {
    println!("Hello, World!");
}`
        },
        {
            name: "Ownership",
            icon: "🔒",
            code: `fn main() {
    let s1 = String::from("hello");
    let s2 = s1.clone();
    println!("s1 = {}, s2 = {}", s1, s2);

    let x = 5;
    let y = x;
    println!("x = {}, y = {}", x, y);
}`
        },
    ],
    Ruby: [
        {
            name: "Hello World",
            icon: "👋",
            code: `puts "Hello, World!"`
        },
        {
            name: "Blocks & Iterators",
            icon: "🔄",
            code: `numbers = [1, 2, 3, 4, 5]

puts "Each:"
numbers.each { |n| puts n }

puts "Map:"
squares = numbers.map { |n| n ** 2 }
puts squares.inspect

puts "Select:"
evens = numbers.select { |n| n.even? }
puts evens.inspect`
        },
    ],
    PHP: [
        {
            name: "Hello World",
            icon: "👋",
            code: `<?php
echo "Hello, World!";
?>`
        },
        {
            name: "Array Functions",
            icon: "📊",
            code: `<?php
$numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

$evens = array_filter($numbers, fn($n) => $n % 2 === 0);
$squares = array_map(fn($n) => $n * $n, $numbers);
$sum = array_sum($numbers);

echo "Evens: " . implode(", ", $evens) . "\\n";
echo "Squares: " . implode(", ", $squares) . "\\n";
echo "Sum: " . $sum . "\\n";
?>`
        },
    ],
    C: [
        {
            name: "Hello World",
            icon: "👋",
            code: `#include<stdio.h>

int main() {
    printf("Hello, World!\\n");
    return 0;
}`
        },
        {
            name: "Pointers",
            icon: "👉",
            code: `#include<stdio.h>

void swap(int* a, int* b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}

int main() {
    int x = 10, y = 20;
    printf("Before: x=%d, y=%d\\n", x, y);
    swap(&x, &y);
    printf("After: x=%d, y=%d\\n", x, y);
    return 0;
}`
        },
    ],
}

function CodeTemplates({ onSelect, currentLanguage }) {
    const [selectedLang, setSelectedLang] = useState(currentLanguage !== 'auto' ? currentLanguage : 'Python')
    const [search, setSearch] = useState('')

    const languages = Object.keys(TEMPLATES)
    const templates = TEMPLATES[selectedLang] || []

    const filtered = templates.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="templates-panel">
            <div className="templates-header">
                <div className="templates-search">
                    <input
                        type="text"
                        placeholder="🔍 Search templates..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="templates-search-input"
                    />
                </div>
            </div>

            <div className="templates-lang-tabs">
                {languages.map(lang => (
                    <button
                        key={lang}
                        className={`templates-lang-btn ${selectedLang === lang ? 'active' : ''}`}
                        onClick={() => { setSelectedLang(lang); setSearch('') }}
                    >
                        {lang}
                    </button>
                ))}
            </div>

            <div className="templates-grid">
                {filtered.map((template, i) => (
                    <div
                        key={i}
                        className="template-card"
                        onClick={() => onSelect(template.code, selectedLang)}
                    >
                        <div className="template-icon">{template.icon}</div>
                        <div className="template-name">{template.name}</div>
                        <div className="template-preview">
                            {template.code.slice(0, 50)}...
                        </div>
                        <div className="template-use">Use Template →</div>
                    </div>
                ))}
            </div>

            <style>{`
        .templates-panel {
          display: flex;
          flex-direction: column;
          gap: 10px;
          animation: fadeIn 0.3s ease;
        }
        .templates-search-input {
          width: 100%;
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid #2d3154;
          background: #0f1117;
          color: #e2e8f0;
          font-size: 12px;
          outline: none;
          font-family: sans-serif;
        }
        .templates-search-input:focus {
          border-color: #7aa2f7;
        }
        .templates-search-input::placeholder {
          color: #475569;
        }
        .templates-lang-tabs {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .templates-lang-btn {
          padding: 5px 12px;
          border-radius: 99px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid #2d3154;
          background: #1a1d2e;
          color: #64748b;
          transition: all 0.15s;
          font-family: sans-serif;
        }
        .templates-lang-btn.active {
          background: #1a2a4a;
          border-color: #7aa2f7;
          color: #7aa2f7;
        }
        .templates-lang-btn:hover:not(.active) {
          color: #e2e8f0;
          border-color: #3d4268;
        }
        .templates-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 10px;
        }
        .template-card {
          background: #0f1117;
          border: 1px solid #2d3154;
          border-radius: 10px;
          padding: 14px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .template-card:hover {
          border-color: #7aa2f7;
          background: #1a1d2e;
          transform: translateY(-2px);
          box-shadow: 0 4px 16px #7aa2f722;
        }
        .template-icon {
          font-size: 24px;
        }
        .template-name {
          font-size: 13px;
          font-weight: 600;
          color: #e2e8f0;
          font-family: sans-serif;
        }
        .template-preview {
          font-size: 10px;
          color: #475569;
          font-family: 'Courier New', monospace;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .template-use {
          font-size: 11px;
          color: #7aa2f7;
          font-family: sans-serif;
          margin-top: auto;
        }
      `}</style>
        </div>
    )
}

export default CodeTemplates