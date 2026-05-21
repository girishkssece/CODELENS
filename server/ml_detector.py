from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
import numpy as np

# Training data — code samples for each language
TRAINING_DATA = [
    # Python
    ("def hello():\n    print('Hello World')\nhello()", "Python"),
    ("import numpy as np\narr = np.array([1,2,3])\nprint(arr.mean())", "Python"),
    ("class Animal:\n    def __init__(self, name):\n        self.name = name", "Python"),
    ("for i in range(10):\n    if i % 2 == 0:\n        print(i)", "Python"),
    ("with open('file.txt', 'r') as f:\n    data = f.read()", "Python"),
    ("lambda x: x * 2", "Python"),
    ("list comprehension = [x for x in range(10)]", "Python"),
    ("import pandas as pd\ndf = pd.read_csv('data.csv')", "Python"),
    ("try:\n    x = int(input())\nexcept ValueError:\n    print('error')", "Python"),
    ("def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)", "Python"),

    # JavaScript
    ("function hello() {\n  console.log('Hello World');\n}", "JavaScript"),
    ("const arr = [1,2,3];\narr.forEach(x => console.log(x));", "JavaScript"),
    ("class Animal {\n  constructor(name) {\n    this.name = name;\n  }\n}", "JavaScript"),
    ("const fetchData = async () => {\n  const res = await fetch(url);\n  return res.json();\n}", "JavaScript"),
    ("let x = 10;\nif (x > 5) {\n  console.log('big');\n}", "JavaScript"),
    ("document.getElementById('btn').addEventListener('click', () => {})", "JavaScript"),
    ("const obj = { name: 'John', age: 30 };\nconst { name } = obj;", "JavaScript"),
    ("Promise.all([p1, p2]).then(values => console.log(values));", "JavaScript"),
    ("export default function App() {\n  return <div>Hello</div>;\n}", "JavaScript"),
    ("const sum = (a, b) => a + b;\nmodule.exports = sum;", "JavaScript"),

    # Java
    ("public class Main {\n  public static void main(String[] args) {\n    System.out.println('Hello');\n  }\n}", "Java"),
    ("import java.util.ArrayList;\nArrayList<String> list = new ArrayList<>();", "Java"),
    ("public interface Animal {\n  void speak();\n}", "Java"),
    ("for (int i = 0; i < 10; i++) {\n  System.out.println(i);\n}", "Java"),
    ("try {\n  int x = Integer.parseInt(str);\n} catch (NumberFormatException e) {}", "Java"),
    ("public class Dog extends Animal {\n  @Override\n  public void speak() {}", "Java"),
    ("Scanner scanner = new Scanner(System.in);\nString input = scanner.nextLine();", "Java"),
    ("HashMap<String, Integer> map = new HashMap<>();\nmap.put('key', 1);", "Java"),
    ("@SpringBootApplication\npublic class App {\n  public static void main(String[] args) {}", "Java"),
    ("String[] arr = new String[10];\nArrays.sort(arr);", "Java"),

    # C++
    ("#include<iostream>\nusing namespace std;\nint main(){\n  cout << 'Hello';\n  return 0;\n}", "C++"),
    ("#include<vector>\nvector<int> v = {1,2,3};\nfor(auto x : v) cout << x;", "C++"),
    ("class Animal {\npublic:\n  string name;\n  void speak();\n};", "C++"),
    ("template<typename T>\nT add(T a, T b) { return a + b; }", "C++"),
    ("int* ptr = new int(5);\ndelete ptr;", "C++"),
    ("#include<algorithm>\nsort(v.begin(), v.end());", "C++"),
    ("struct Node {\n  int data;\n  Node* next;\n};", "C++"),
    ("cin >> x;\ncout << x << endl;", "C++"),
    ("namespace myspace {\n  void hello() { cout << 'hi'; }\n}", "C++"),
    ("#include<map>\nmap<string,int> m;\nm['key'] = 1;", "C++"),

    # C
    ("#include<stdio.h>\nint main(){\n  printf('Hello World');\n  return 0;\n}", "C"),
    ("#include<stdlib.h>\nint* arr = malloc(10 * sizeof(int));", "C"),
    ("struct Point {\n  int x;\n  int y;\n};", "C"),
    ("void swap(int* a, int* b) {\n  int temp = *a;\n  *a = *b;\n  *b = temp;\n}", "C"),
    ("#include<string.h>\nstrlen(str);\nstrcpy(dest, src);", "C"),
    ("scanf('%d', &x);\nprintf('%d', x);", "C"),
    ("typedef struct Node {\n  int data;\n  struct Node* next;\n} Node;", "C"),
    ("FILE* fp = fopen('file.txt', 'r');\nfclose(fp);", "C"),
    ("int arr[10];\nfor(int i=0; i<10; i++) arr[i] = i;", "C"),
    ("#define MAX 100\nconst int SIZE = 10;", "C"),

    # Go
    ("package main\nimport 'fmt'\nfunc main() {\n  fmt.Println('Hello')\n}", "Go"),
    ("func add(a, b int) int {\n  return a + b\n}", "Go"),
    ("type Animal struct {\n  Name string\n  Age  int\n}", "Go"),
    ("ch := make(chan int)\ngo func() { ch <- 42 }()", "Go"),
    ("slice := []int{1, 2, 3}\nfor i, v := range slice {}", "Go"),
    ("map1 := map[string]int{'a': 1, 'b': 2}", "Go"),
    ("defer fmt.Println('done')\nif err != nil { log.Fatal(err) }", "Go"),
    ("import (\n  'fmt'\n  'os'\n  'strings'\n)", "Go"),
    ("var wg sync.WaitGroup\nwg.Add(1)\nwg.Wait()", "Go"),
    ("interface{}\nfunc (a Animal) Speak() string { return a.Name }", "Go"),

    # Rust
    ("fn main() {\n  println!('Hello World');\n}", "Rust"),
    ("let mut v: Vec<i32> = Vec::new();\nv.push(1);", "Rust"),
    ("struct Animal {\n  name: String,\n  age: u32,\n}", "Rust"),
    ("impl Animal {\n  fn new(name: &str) -> Self {}\n}", "Rust"),
    ("match x {\n  1 => println!('one'),\n  _ => println!('other'),\n}", "Rust"),
    ("use std::collections::HashMap;\nlet mut map = HashMap::new();", "Rust"),
    ("fn add<T: std::ops::Add>(a: T, b: T) -> T { a + b }", "Rust"),
    ("let result: Result<i32, String> = Ok(42);", "Rust"),
    ("trait Speak {\n  fn speak(&self) -> String;\n}", "Rust"),
    ("cargo build\ncargo run\ncargo test", "Rust"),

    # PHP
    ("<?php\necho 'Hello World';\n?>", "PHP"),
    ("<?php\n$name = 'John';\necho \"Hello $name\";", "PHP"),
    ("<?php\nfunction greet($name) {\n  return 'Hello ' . $name;\n}", "PHP"),
    ("<?php\n$arr = array(1, 2, 3);\nforeach($arr as $val) { echo $val; }", "PHP"),
    ("<?php\nclass Animal {\n  public $name;\n  function __construct($name) {}", "PHP"),
    ("<?php\n$conn = mysqli_connect('localhost', 'user', 'pass', 'db');", "PHP"),
    ("<?php\n$_POST['username'];\n$_GET['id'];\n$_SESSION['user'];", "PHP"),
    ("<?php\nif(isset($_POST['submit'])) {\n  $data = $_POST['data'];\n}", "PHP"),
    ("<?php\nrequire_once 'config.php';\ninclude 'header.php';", "PHP"),
    ("<?php\nnamespace App\\Controllers;\nuse App\\Models\\User;", "PHP"),

    # Ruby
    ("puts 'Hello World'", "Ruby"),
    ("def greet(name)\n  puts \"Hello #{name}\"\nend", "Ruby"),
    ("class Animal\n  attr_accessor :name\n  def initialize(name)\n    @name = name\n  end\nend", "Ruby"),
    ("[1,2,3].each { |x| puts x }", "Ruby"),
    ("hash = { name: 'John', age: 30 }\nhash[:name]", "Ruby"),
    ("require 'json'\nJSON.parse(data)", "Ruby"),
    ("5.times { |i| puts i }\n(1..10).map { |x| x * 2 }", "Ruby"),
    ("begin\n  raise 'error'\nrescue => e\n  puts e.message\nend", "Ruby"),
    ("module Greetable\n  def greet\n    puts 'Hello'\n  end\nend", "Ruby"),
    ("ActiveRecord::Base.establish_connection\nUser.find_by(name: 'John')", "Ruby"),
]

class MLLanguageDetector:
    def __init__(self):
        self.model = Pipeline([
            ('tfidf', TfidfVectorizer(
                analyzer='char_wb',
                ngram_range=(2, 4),
                max_features=5000,
                sublinear_tf=True
            )),
            ('clf', MultinomialNB(alpha=0.1))
        ])
        self._train()

    def _train(self):
        codes = [item[0] for item in TRAINING_DATA]
        labels = [item[1] for item in TRAINING_DATA]
        self.model.fit(codes, labels)

    def detect(self, code):
        prediction = self.model.predict([code])[0]
        probabilities = self.model.predict_proba([code])[0]
        classes = self.model.classes_
        confidence = float(np.max(probabilities)) * 100

        # Top 3 predictions
        top_indices = np.argsort(probabilities)[::-1][:3]
        top_predictions = [
            {
                "language": classes[i],
                "confidence": round(float(probabilities[i]) * 100, 1)
            }
            for i in top_indices
        ]

        return {
            "language": prediction,
            "confidence": round(confidence, 1),
            "top_predictions": top_predictions
        }

# Singleton instance
detector = MLLanguageDetector()