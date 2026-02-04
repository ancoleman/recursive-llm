# Recursive Language Models

**Authors:** Alex L. Zhang, Tim Kraska, Omar Khattab
**Institution:** MIT CSAIL
**arXiv:** 2512.24601v1 [cs.AI] 31 Dec 2025

---

## Abstract

We study allowing large language models (LLMs) to process arbitrarily long prompts through the lens of inference-time scaling. We propose **Recursive Language Models (RLMs)**, a general inference strategy that treats long prompts as part of an external environment and allows the LLM to programmatically examine, decompose, and recursively call itself over snippets of the prompt. We find that RLMs successfully handle inputs up to two orders of magnitude beyond model context windows and, even for shorter prompts, dramatically outperform the quality of base LLMs and common long-context scaffolds across four diverse long-context tasks, while having comparable (or cheaper) cost per query.

---

## 1. Introduction

Despite rapid progress in reasoning and tool use, modern language models still have limited context lengths and, even within these limits, appear to inevitably exhibit **context rot** (Hong et al., 2025), the phenomenon where the quality of even frontier models like GPT-5 degrades quickly as context gets longer. Though we expect context lengths to steadily rise through improvements to training, architecture, and infrastructure, we are interested in whether it is possible to dramatically scale the context size of general-purpose LLMs by orders of magnitude. This is increasingly urgent as LLMs begin to be widely adopted for long-horizon tasks, in which they must routinely process tens if not hundreds of millions of tokens.

We study this question through the lens of scaling inference-time compute. We draw broad inspiration from **out-of-core algorithms**, in which data-processing systems with a small but fast main memory can process far larger datasets by cleverly managing how data is fetched into memory.

One general and increasingly popular inference-time approach in this space is **context condensation or compaction** (Khattab et al., 2021; Smith, 2025; OpenAI, 2025; Wu et al., 2025), in which the context is repeatedly summarized once it exceeds a length threshold. Unfortunately, compaction is rarely expressive enough for tasks that require dense access to many parts of the prompt, as it presumes in effect that some details that appear early in the prompt can safely be forgotten to make room for new content.

### Key Insight

We introduce **Recursive Language Models (RLMs)**, a general-purpose inference paradigm for dramatically scaling the effective input and output lengths of modern LLMs. The key insight is that **long prompts should not be fed into the neural network (e.g., Transformer) directly but should instead be treated as part of the environment that the LLM can symbolically interact with**.

### How RLMs Work

An RLM exposes the same external interface as an LLM: it accepts a string prompt of arbitrary structure and produces a string response. Given a prompt P, the RLM:

1. Initializes a **Read-Eval-Print Loop (REPL)** programming environment in which P is set as the value of a variable
2. Offers the LLM general context about the REPL environment (e.g., the length of the string P)
3. Permits the LLM to write code that peeks into and decomposes P, and to iteratively observe any side effects from execution
4. Crucially, encourages the LLM to programmatically construct sub-tasks on which they can invoke themselves **recursively**

By treating the prompt as an object in the external environment, this simple design tackles a foundational limitation in many prior approaches (Anthropic, 2025; Sentient, 2025; Schroeder et al., 2025; Sun et al., 2025), which focus on recursive decomposition of tasks but cannot allow their input to scale beyond the context window of the underlying LLM.

---

## 2. Scaling Long Context Tasks

Recent work (Hsieh et al., 2024; Goldman et al., 2025; Hong et al., 2025) has successfully argued that the effective context window of LLMs can often be much shorter than a model's physical maximum number of tokens. Going further, we hypothesize that **the effective context window of an LLM cannot be understood independently of the specific task**. That is, more "complex" problems will exhibit degradation at even shorter lengths than simpler ones.

### 2.1 Tasks

We design our empirical evaluation around tasks where we are able to vary not just the lengths of the prompts, but also consider different scaling patterns for problem complexity. We loosely characterize each task by **information density**, i.e. how much information an agent is required to process to answer the task, and how this scales with different input sizes.

#### S-NIAH (Single Needle-in-a-Haystack)
Following the single needle-in-the-haystack task in RULER (Hsieh et al., 2024), we consider a set of 50 single needle-in-the-haystack tasks that require finding a specific phrase or number in a large set of unrelated text. These tasks require finding a single answer regardless of input size, and as a result **scale roughly constant** in processing costs with respect to input length.

#### BrowseComp-Plus (1K documents)
A multi-hop question-answering benchmark for DeepResearch (OpenAI, 2025) questions that requires reasoning over multiple different documents. The benchmark provides a verified offline corpus of 100K documents that is guaranteed to contain gold, evidence, and hard negative documents for each task. Following Sun et al. (2025), we use 150 randomly sampled tasks as our evaluation set; we provide 1000 randomly chosen documents to the model or agent.

#### OOLONG
A long reasoning benchmark that requires examining and transforming chunks of the input semantically, then aggregating these chunks to form a final answer. We focus specifically on the `trec_coarse` split, which is a set of 50 tasks over a dataset of questions with semantic labels. Each task requires using nearly all entries of the dataset, and therefore **scales linearly** in processing costs relative to the input length.

#### OOLONG-Pairs
We manually modify the `trec_coarse` split of OOLONG to include 20 new queries that specifically require aggregating **pairs** of chunks to construct the final answer. Each task requires using nearly all pairs of entries of the dataset, and therefore **scales quadratically** in processing costs relative to the input length.

#### LongBench-v2 CodeQA
A multi-choice code repository understanding split from LongBench-v2 that is challenging for modern frontier models. Each task requires reasoning over a fixed number of files in a codebase to find the right answer.

### 2.2 Methods and Baselines

We compare RLMs against other commonly used task-agnostic methods using two contemporary LMs:
- **GPT-5** with medium reasoning (OpenAI, 2025)
- **Qwen3-Coder-480B-A35B** (Yang et al., 2025)

#### RLM with REPL
We implement an RLM that loads its context as a string in the memory of a Python REPL environment. The REPL environment also loads in a module that allows it to query a sub-LM inside the environment. For GPT-5 experiments, we use **GPT-5-mini for recursive LMs** and GPT-5 for the root LM, as we found this choice to strike a powerful tradeoff between capabilities and cost.

#### RLM with REPL, no sub-calls (Ablation)
The REPL environment loads in the context, but is not able to use sub-LM calls. In this setting, the LM can still interact with its context in a REPL environment before providing a final answer.

#### Summary Agent
Following Sun et al. (2025); Wu et al. (2025); Yu et al. (2025), we consider an iterative agent that invokes a summary of the context as it is filled. In cases where the provided context exceeds the model window, the agent will chunk the input to fit within the model context window and invoke the same strategy over these chunks.

#### CodeAct (+ BM25)
A CodeAct (Wang et al., 2024) agent that can execute code inside of a ReAct (Yao et al., 2023) loop. Unlike an RLM, it does not offload its prompt to the code environment, and instead provides it directly to the LM. We equip this agent with a BM25 retriever that indexes the input context for tasks where this is appropriate.

---

## 3. Results and Discussion

### Main Results Table

| Model | CodeQA (23K-4.2M) | BrowseComp+ 1K (6M-11M) | OOLONG (131K) | OOLONG-Pairs (32K) |
|-------|-------------------|-------------------------|---------------|-------------------|
| **Qwen3-Coder-480B** |
| Base Model | 20.00* | 0.00* | 36.00 | 0.06 |
| CodeAct (+ BM25) | 24.00* | 12.66 | 38.00 | 0.28 |
| Summary agent | 50.00 | 38.00 | 44.06 | 0.31 |
| **RLM** | **56.00** | **44.66** | **48.00** | **23.11** |
| RLM (no sub-calls) | 66.00 | 46.00 | 43.50 | 17.34 |
| **GPT-5** |
| Base Model | 24.00* | 0.00* | 44.00 | 0.04 |
| CodeAct (+ BM25) | 22.00* | 51.00 | 38.00 | 24.67 |
| Summary agent | 58.00 | 70.47 | 46.00 | 0.01 |
| **RLM** | **62.00** | **91.33** | **56.50** | **58.00** |
| RLM (no sub-calls) | 58.00 | 88.00 | 36.00 | 43.93 |

*\* indicates runs where the method ran into input context limits.*

### Key Observations

#### Observation 1: RLMs Scale to 10M+ Tokens
RLMs demonstrate strong performance on input tasks well beyond the effective context window of a frontier LM, outperforming base models and common long-context scaffolds by up to **2× the performance** while maintaining comparable or cheaper average token costs. Notably, RLMs scale well to the theoretical costs of extending a base model's context window – on BrowseComp-Plus (1K), the cost of GPT-5-mini ingesting 6-11M input tokens is $1.50−$2.75, while RLM(GPT-5) has an average cost of **$0.99** and outperforms both the summarization and retrieval baselines by over 29%.

On OOLONG-Pairs, both GPT-5 and Qwen3-Coder make little progress with F1 scores of <0.1%, while the RLM using these models achieve F1 scores of **58.00%** and **23.11%** respectively, highlighting the emergent capability of RLMs to handle extremely information-dense tasks.

#### Observation 2: REPL Environment is Necessary
A key characteristic of RLMs is offloading the context as a variable in an environment E that the model can interact with. Even without sub-calling capabilities, the ablation of the RLM is able to scale beyond the context limit of the model, and outperform the base model and other task-agnostic baselines on most long context settings.

On information-dense tasks like OOLONG or OOLONG-Pairs, recursive LM sub-calling is necessary. RLMs outperform the ablation without sub-calling by **10%-59%** on all information-dense tasks.

#### Observation 3: LM Performance Degrades as Function of Length and Complexity
GPT-5 performance degrades significantly faster for more complex tasks, while RLM performance degrades but at a **much slower rate**. For context lengths beyond 2^14, the RLM consistently outperforms GPT-5.

#### Observation 4: RLM Costs Remain Comparable but High Variance
RLMs iteratively interact with their context until they find a suitable answer, leading to large differences in iteration length depending on task complexity. For GPT-5, the **median RLM run is cheaper than the median base model run**, but many outlier RLM runs are significantly more expensive. Compared to the summarization baseline which ingests the entire input context, RLMs are up to **3× cheaper** while maintaining stronger performance.

#### Observation 5: Model-Agnostic but Different Behaviors
While GPT-5 and Qwen3-Coder-480B both exhibit strong performance as RLMs, they also exhibit different performance and behavior across all tasks. On BrowseComp-Plus, RLM(GPT-5) nearly solves all tasks while RLM(Qwen3-Coder) struggles to solve half.

### 3.1 Emergent Patterns in RLM Trajectories

Even without explicit training, RLMs exhibit interesting context management and problem decomposition behavior:

#### Filtering Input Using Code Execution Based on Model Priors
A key intuition for why RLMs can maintain strong performance on huge inputs without exploding costs is the LM's ability to filter input context without explicitly seeing it. Model priors enable the RLM to narrow the search space and process fewer input tokens.

#### Chunking and Recursively Sub-calling LMs
RLMs defer essentially unbounded-length reasoning chains to sub-(R)LM calls. The choice of decomposition can greatly affect task performance. Common strategies include uniform chunking or keyword searches.

#### Answer Verification Through Sub-LM Calls
We observed several instances of answer verification made by RLMs through sub-LM calls. Some strategies implicitly avoid context rot by using sub-LMs to perform verification.

#### Passing Recursive LM Outputs Through Variables
RLMs are able to produce essentially unbounded tokens well beyond the limit of the base LM by returning variables in the REPL as output. Through the REPL, the RLM can iteratively construct these variables as a mixture of programmatic and sub-(R)LM output calls.

---

## 4. Related Works

### Long Context LM Systems
There have primarily been two orthogonal directions for long context management:
1. Directly changing the architecture of and retraining the base LM (Press et al., 2022; Gu et al., 2022; Munkhdalai et al., 2024)
2. Building a scaffold around the LM that implicitly handles the context

Popular strategies include:
- **Lossy context management**: summarization or truncation (MemWalker, ReSum)
- **Explicit memory hierarchy**: (MemGPT, Mem0, G-memory)

RLMs are different from prior work in that **all context window management is implicitly handled by the LM itself**.

### Task Decomposition Through Sub-LM Calls
Several methods like ViperGPT (Surís et al., 2023), THREAD (Schroeder et al., 2025), DisCIPL (Grand et al., 2025), ReDel (Zhu et al., 2024), Context Folding (Sun et al., 2025), and AgentFold (Ye et al., 2025) have explored deferring the choice of sub-LM calls to the LM. These techniques emphasize task decomposition through recursive LM calls, but are **unable to handle long context inputs beyond the length of the base LM**. RLMs, by placing the prompt as part of the external environment, can symbolically manipulate arbitrarily long strings.

---

## 5. Limitations and Future Work

- The optimal mechanism for implementing RLMs remains underexplored
- Alternative strategies involving **asynchronous sub-calls** and sandboxed REPLs can potentially significantly reduce runtime and inference cost
- We chose max recursion depth of one (sub-calls are LMs); future work should investigate **deeper layers of recursion**
- Current models are inefficient decision makers over their context
- RLM trajectories can be viewed as a form of **reasoning**, which can be trained by bootstrapping existing frontier models

---

## 6. Conclusion

We introduced Recursive Language Models (RLMs), a general inference framework for language models that:
- Offloads the input context to an external environment
- Enables language models to recursively sub-query language models before providing an output

We explored an instantiation that offloads the context into a **Python REPL environment** as a variable in memory, enabling the LM to reason over its context in code and recursive LM calls, rather than purely in token space.

Our results demonstrated that RLMs are an effective task-agnostic paradigm for both long-context problems and general reasoning. We are excited to see future work that explicitly trains models to reason as RLMs, which could result in another axis of scale for the next generation of language model systems.

---

## Appendix A: Negative Results

### Things That Did Not Work

1. **Using the exact same RLM system prompt across all models can be problematic.** We had to add a small sentence to the Qwen3-Coder prompt to prevent it from using too many recursive sub-calls.

2. **Models without sufficient coding capabilities struggle as RLMs.** Smaller models like Qwen3-8B struggled without sufficient coding abilities.

3. **Thinking models without sufficient output tokens struggle as RLMs.** Qwen3-235B-A22B showed smaller gaps due to thinking tokens exceeding maximum output token length.

4. **RLMs without asynchronous LM calls are slow.** All sub-LM queries were implemented as blocking/sequential calls.

5. **Distinguishing between final answer and thought is brittle.** The current strategy using FINAL() or FINAL_VAR() tags can cause strange decisions.

---

## Appendix B: RLM Trajectory Examples

### B.1 RLM(GPT-5) on BrowseComp-Plus-Query 74
- **Total cost:** $0.079
- **Task:** Multi-hop query requiring finding a beauty pageant winner from festival documentation
- **Strategy:** Regex queries to probe documents → sub-LM call over relevant snippet → verification calls → final answer
- **Result:** Correct answer "Maria Dalmacio"

### B.2 RLM(Qwen3-Coder) on OOLONG-Pairs-Query 3
- **Total cost:** $1.12
- **Task:** Output all pairs of user IDs satisfying semantic properties
- **Strategy:** Probe context → classify entries using sub-LM calls → programmatically generate pairs
- **Notable behavior:** Model repeatedly verified answers, sometimes discarding correct answers and continuing with more sub-calls

### B.3 RLM(Qwen3-Coder) on OOLONG-Query 212
- **Total cost:** $0.38
- **Task:** Aggregate query comparing label frequencies
- **Notable:** Qwen3-Coder makes one sub-LM call per line (thousands of calls), while GPT-5 makes ~ten calls for similar tasks

### B.4 RLM(GPT-5) on CodeQA-Query 44
- **Total cost:** $0.27
- **Task:** Understanding 900k token codebase
- **Strategy:** Break codebase into chunks → sub-query each chunk → aggregate clues → final sub-query for answer
- **Result:** Correct answer (choice 1)

---

## Appendix D: System Prompts

### RLM with REPL System Prompt (Summary)

```
You are tasked with answering a query with associated context. You can access,
transform, and analyze this context interactively in a REPL environment that
can recursively query sub-LLMs.

Your context is a {context_type} with {context_total_length} total characters.

The REPL environment is initialized with:
1. A 'context' variable containing important information
2. A 'llm_query' function to query an LLM (~500K chars capacity)
3. The ability to use 'print()' statements

Strategy: First look at context, figure out chunking strategy, break into smart
chunks, query an LLM per chunk, save answers to buffer, then query LLM with all
buffers to produce final answer.

When done, use FINAL(answer) or FINAL_VAR(variable_name).
```

### Qwen3-Coder Addition
```
IMPORTANT: Be very careful about using 'llm_query' as it incurs high runtime
costs. Always batch as much information as reasonably possible into each call
(aim for around ~200k characters per call).
```

---

## Appendix E: OOLONG-Pairs Benchmark

20 synthetically generated tasks requiring aggregating pairs of entries. Tasks explicitly ask for all pairs satisfying properties to ensure O(N²) complexity.

Example task:
> "In the above data, list all pairs of user IDs (no duplicate pairs, list lower ID first) where both users have at least one instance with a description and abstract concept or abbreviation."

---

## Key References

- Bertsch et al., 2025 - OOLONG benchmark
- Chen et al., 2025 - BrowseComp-Plus
- Hong et al., 2025 - Context rot research
- Hsieh et al., 2024 - RULER benchmark
- OpenAI, 2025 - GPT-5, Deep Research
- Schroeder et al., 2025 - THREAD recursive spawning
- Sun et al., 2025 - Context Folding
- Wang et al., 2024 - CodeAct
- Wu et al., 2025 - ReSum
- Yang et al., 2025 - Qwen3

---

## Citation

```bibtex
@misc{zhang2025rlm,
  title={Recursive Language Models},
  author={Zhang, Alex L. and Kraska, Tim and Khattab, Omar},
  year={2025},
  eprint={2512.24601},
  archivePrefix={arXiv},
  primaryClass={cs.AI}
}
```
