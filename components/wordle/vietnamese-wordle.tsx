"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RotateCcw, HelpCircle, Loader2 } from "lucide-react"
import TutorialModal from "@/components/wordle/tutorial-modal"
import { toast } from "react-toastify"
import { wordList } from "@/lib/wordle.js"

function normalize(str: string) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/\s+/g, "")
    .toUpperCase()
}

const VIETNAMESE_KEYBOARD_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["BACKSPACE", "Z", "X", "C", "V", "B", "N", "M", "ENTER"],
]

type LetterState = "correct" | "present" | "absent" | "empty"

interface GameState {
  board: string[][]
  currentRow: number
  currentCol: number
  gameStatus: "playing" | "won" | "lost"
  targetWord: string
  originalWord: string
  letterStates: Record<string, LetterState>
  hintCount: number
  hintedLetters: Set<string>
  syllableHint: string | null
}

interface WordData {
  original: string
  normalized: string
}

export default function VietnameseWordle() {
  const [showTutorial, setShowTutorial] = useState<boolean>(true)
  const [isLoadingWord, setIsLoadingWord] = useState<boolean>(false)
  const [isCheckingWord, setIsCheckingWord] = useState<boolean>(false)
  const [gameState, setGameState] = useState<GameState>({
    board: Array.from({ length: 6 }, () => Array(7).fill("")),
    currentRow: 0,
    currentCol: 0,
    gameStatus: "playing",
    targetWord: "",
    originalWord: "",
    letterStates: {},
    hintCount: 0,
    hintedLetters: new Set(),
    syllableHint: null,
  })

  // === Fetch / Check từ điển ===
  const fetchNewWord = async (): Promise<WordData> => {
    setIsLoadingWord(true)
    try {
      const randomIndex = Math.floor(Math.random() * wordList.length)
      const original = wordList[randomIndex]
      const normalized = normalize(original)
      return { original, normalized }
    } catch (error) {
      console.error("Error fetching word:", error)
      return { original: "học sinh", normalized: "HOCSINH" }
    } finally {
      setIsLoadingWord(false)
    }
  }

  const checkWordExists = async (word: string): Promise<boolean> => {
    setIsCheckingWord(true)
    try {
      const normalizedInput = normalize(word)
      const normalizedList = wordList.map(normalize)
      return normalizedList.includes(normalizedInput)
    } catch (error) {
      console.error("Error checking word:", error)
      return false
    } finally {
      setIsCheckingWord(false)
    }
  }

  // === Phân tích âm tiết để hiển thị hint cấu trúc ===
  const analyzeSyllableStructure = (originalWord: string): string => {
    const syllables = originalWord.trim().split(/\s+/)
    if (syllables.length === 2) {
      const firstLen = syllables[0].length
      const secondLen = syllables[1].length
      return `Từ gồm 2 âm tiết, âm đầu tiên có ${firstLen} chữ, âm thứ hai có ${secondLen} chữ.`
    }
    const clean = originalWord.replace(/\s+/g, "")
    const half = Math.ceil(clean.length / 2)
    const rest = clean.length - half
    return `Từ gồm 2 âm tiết (ước lượng), âm đầu tiên ~ ${half} chữ, âm thứ hai ~ ${rest} chữ.`
  }

  // === Khởi tạo/làm mới game ===
  const initializeGame = useCallback(async () => {
    const wordData = await fetchNewWord()
    console.log("🎯 Target word:", wordData.original)
    setGameState({
      board: Array.from({ length: 6 }, () => Array(7).fill("")),
      currentRow: 0,
      currentCol: 0,
      gameStatus: "playing",
      targetWord: wordData.normalized,
      originalWord: wordData.original,
      letterStates: {},
      hintCount: 0,
      hintedLetters: new Set(),
      syllableHint: analyzeSyllableStructure(wordData.original),
    })
  }, [])

  useEffect(() => {
    initializeGame()
  }, [initializeGame])

  const resetGame = useCallback(() => {
    initializeGame()
  }, [initializeGame])

  // === Hàm checkGuess, trả về mảng độ dài 7 với trạng thái từng chữ ===
  const checkGuess = useCallback((guess: string): LetterState[] => {
    const target = gameState.targetWord
    const result: LetterState[] = Array(7).fill("absent")
    const targetLetters = target.split("")
    const guessLetters = guess.split("")
    
    // Đếm số lần xuất hiện của các ký tự trong từ đích
    const targetLetterCount: Record<string, number> = {}
    for (const letter of targetLetters) {
      targetLetterCount[letter] = (targetLetterCount[letter] || 0) + 1
    }
    
    // Đánh dấu correct trước
    for (let i = 0; i < 7; i++) {
      if (guessLetters[i] === targetLetters[i]) {
        result[i] = "correct"
        targetLetterCount[guessLetters[i]]--
      }
    }

    // Đánh dấu present
    for (let i = 0; i < 7; i++) {
      if (result[i] !== "correct" && targetLetterCount[guessLetters[i]] > 0) {
        result[i] = "present"
        targetLetterCount[guessLetters[i]]--
      }
    }

    return result
  }, [gameState.targetWord])

  // === Tính kết quả từng hàng ===
  const rowResults = useMemo(() => {
    const results: (LetterState[] | null)[] = Array(6).fill(null)
    for (let row = 0; row < gameState.currentRow; row++) {
      const rowStr = gameState.board[row].join("")
      if (rowStr.length === 7) {
        results[row] = checkGuess(rowStr)
      }
    }
    return results
  }, [gameState.board, gameState.currentRow, checkGuess])

  // === Xử lý gợi ý từng chữ ===
  const getHint = useCallback(() => {
    if (gameState.hintCount >= 3) return

    const guessedLetters = new Set(
      gameState.board
        .slice(0, gameState.currentRow)
        .flat()
        .filter((l) => l !== "")
    )
    const used = new Set<string>([
      ...guessedLetters,
      ...Object.keys(gameState.letterStates),
      ...gameState.hintedLetters,
    ])
    const uniqTarget = Array.from(new Set(gameState.targetWord.split("")))
    const available = uniqTarget.filter((l) => !used.has(l))

    if (available.length > 0) {
      const rand = available[Math.floor(Math.random() * available.length)]
      setGameState((prev) => {
      const newSet = new Set(prev.hintedLetters)
      newSet.add(rand)
      return {
        ...prev,
        hintCount: prev.hintCount + 1,
        hintedLetters: newSet,
      }
      })
      toast.info(`Gợi ý: Chữ "${rand}" có trong từ!`, {
      position: "top-center",
      autoClose: 3000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      })
    } else {
      setGameState((prev) => ({
      ...prev,
      hintCount: prev.hintCount + 1,
      }))
      toast.info("Không còn chữ nào để gợi ý!", {
      position: "top-center",
      autoClose: 3000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      })
    }
  }, [gameState])

  // === Submit guess ===
  const submitGuess = useCallback(async () => {
    const guess = gameState.board[gameState.currentRow].join("")
    if (guess.length !== 7) {
      toast.error("Từ phải có đủ 7 chữ cái!", {
      position: "top-center",
      autoClose: 3000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      })
      return
    }

    const exists = await checkWordExists(guess)
    if (!exists) {
      setGameState((prev) => {
      const newBoard = prev.board.map((r, idx) =>
        idx === prev.currentRow ? Array(7).fill("") : [...r]
      )
      return {
        ...prev,
        board: newBoard,
        currentCol: 0,
      }
      })
      toast.error("Từ không tồn tại trong từ điển!", {
      position: "top-center",
      autoClose: 3000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      })
      return
    }

    const result = checkGuess(guess)
    const newLetterStates = { ...gameState.letterStates }

    result.forEach((state, idx) => {
      const ch = guess[idx]
      const prevState = newLetterStates[ch]
      if (!prevState) {
        newLetterStates[ch] = state
      } else if (prevState === "absent" && state !== "absent") {
        newLetterStates[ch] = state
      } else if (prevState === "present" && state === "correct") {
        newLetterStates[ch] = "correct"
      }
    })

    const isWin = guess === gameState.targetWord
    const isLoss = gameState.currentRow === 5 && !isWin

    setGameState((prev) => ({
      ...prev,
      letterStates: newLetterStates,
      gameStatus: isWin ? "won" : isLoss ? "lost" : "playing",
      currentRow: prev.currentRow + 1,
      currentCol: 0,
    }))
  }, [gameState, checkGuess])

  // === Xử lý nhập bàn phím ===
  const handleKeyPress = useCallback(
    (key: string) => {
      if (gameState.gameStatus !== "playing" || isCheckingWord) return

      if (key === "ENTER") {
        if (gameState.currentCol === 7) {
          submitGuess()
        } else {
          toast.error("Từ phải có đủ 7 chữ cái!", {
            position: "top-center",
            autoClose: 3000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
          })
        }
      } else if (key === "BACKSPACE") {
        if (gameState.currentCol > 0) {
          setGameState((prev) => {
            const newBoard = prev.board.map((r) => [...r])
            newBoard[prev.currentRow][prev.currentCol - 1] = ""
            return {
              ...prev,
              board: newBoard,
              currentCol: prev.currentCol - 1,
            }
          })
        }
      } else if (/^[A-Z]$/.test(key)) {
        if (gameState.currentCol < 7) {
          setGameState((prev) => {
            const newBoard = prev.board.map((r) => [...r])
            newBoard[prev.currentRow][prev.currentCol] = key
            return {
              ...prev,
              board: newBoard,
              currentCol: prev.currentCol + 1,
            }
          })
        }
      }
    },
    [gameState, isCheckingWord, submitGuess]
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toUpperCase()
      if (k === "ENTER" || k === "BACKSPACE" || /^[A-Z]$/.test(k)) {
        e.preventDefault()
        handleKeyPress(k)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyPress])

  // === Lấy màu của ô ===
  const getTileColor = useCallback((row: number, col: number): string => {
    const letter = gameState.board[row][col]
    if (!letter) return "bg-gray-100 border-gray-300 dark:bg-neutral-800 dark:border-neutral-600"

    if (row >= gameState.currentRow) {
      return "bg-gray-100 border-gray-400 dark:bg-neutral-800 dark:border-neutral-500"
    }

    const rowRes = rowResults[row]
    if (!rowRes) {
      return "bg-gray-100 border-gray-400 dark:bg-neutral-800 dark:border-neutral-500"
    }

    const status = rowRes[col]
    switch (status) {
      case "correct":
        return "bg-green-500 dark:bg-emerald-600 text-white border-green-500 dark:border-emerald-600"
      case "present":
        return "dark:bg-amber-500 text-white dark:border-amber-500 bg-yellow-500 border-yellow-500"
      case "absent":
        return "dark:bg-neutral-500 bg-gray-500 text-white border-gray-500 dark:border-neutral-500"
      default:
        return "bg-gray-100 border-gray-400 dark:bg-neutral-800 dark:border-neutral-500"
    }
  }, [gameState.board, gameState.currentRow, rowResults])

  // === Hiển thị ký tự đúng vị trí ===
  const getDisplayLetter = useCallback((row: number, col: number): string => {
    const letter = gameState.board[row][col]
    if (!letter) return ""

    if (row >= gameState.currentRow) return letter

    const rowRes = rowResults[row]
    if (!rowRes) return letter

    if (rowRes[col] === "correct") {
      const cleanOriginal = gameState.originalWord.replace(/\s+/g, "").split("")
      return cleanOriginal[col] || letter
    }
    return letter
  }, [gameState.board, gameState.currentRow, gameState.originalWord, rowResults])

  // === Lấy màu phím chữ ===
  const getKeyColor = useCallback((key: string): string => {
    const state = gameState.letterStates[key]
    const isHinted = gameState.hintedLetters.has(key)
    if (isHinted && !state) {
      return "dark:bg-amber-400 bg-yellow-400 border-yellow-400 text-black dark:border-amber-400"
    }
    switch (state) {
      case "correct":
        return "bg-green-500 dark:bg-emerald-600 text-white border-green-500 dark:border-emerald-600"
      case "present":
        return "bg-amber-500 text-white border-amber-500"
      case "absent":
        return "bg-gray-500 text-white border-gray-500 dark:border-neutral-500"
      default:
        return "bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 dark:text-white"
    }
  }, [gameState.letterStates, gameState.hintedLetters])

  // === Loading mới từ ===
  if (isLoadingWord) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-neutral-900 dark:to-neutral-800 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 dark:text-teal-500 mb-4" />
            <p className="text-lg font-semibold">Đang tải từ mới...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen md:min-h-dvh-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-neutral-900 dark:to-neutral-800 transition-colors duration-200 md:p-4">
      <TutorialModal isOpen={showTutorial} onClose={() => setShowTutorial(false)} />

      <Card className="w-full h-screen md:h-full max-w-lg md:shadow-2xl border-0 bg-white/90 dark:bg-neutral-900 md:backdrop-blur-xl dark:border p-1 md:p-4">
        <CardHeader className="text-center p-4 md:p-4 pb-6 md:pb-4 space-y-0">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTutorial(true)}
              className="text-neutral-600 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              <HelpCircle className="h-5 w-5" />
            </Button>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r text-neutral-600 hover:text-neutral-800 dark:text-white dark:hover:text-neutral-200 bg-clip-text">
              Wordle
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={getHint}
                disabled={gameState.hintCount >= 3 || gameState.gameStatus !== "playing"}
                className="text-xs bg-white dark:bg-neutral-800 dark:text-white"
              >
                Còn {3 - gameState.hintCount} gợi ý
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetGame}
                className="text-neutral-600 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                <RotateCcw className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {gameState.gameStatus === "won" && (
            <div className="mt-4 p-4 bg-green-100 dark:bg-emerald-900/30 rounded-lg border border-green-200 dark:border-emerald-800">
              <p className="text-green-800 dark:text-emerald-200 font-semibold text-lg">🎉 Chúc mừng! Bạn đã thắng!</p>
              <p className="text-green-700 dark:text-emerald-300 mt-2">
                Từ cần tìm: <span className="font-bold text-xl">&ldquo;{gameState.originalWord}&ldquo;</span>
              </p>
            </div>
          )}

          {gameState.gameStatus === "lost" && (
            <div className="mt-4 p-4 bg-red-100 dark:bg-rose-900/30 rounded-lg border border-red-200 dark:border-rose-800">
              <p className="text-red-800 dark:text-rose-200 font-semibold text-lg">😔 Hết lượt rồi!</p>
              <p className="text-red-700 dark:text-rose-300 mt-2">
                Từ cần tìm: <span className="font-bold text-xl">&ldquo;{gameState.originalWord}&ldquo;</span>
              </p>
            </div>
          )}

          {gameState.syllableHint && (
            <div className="mt-4 p-4 bg-blue-100 dark:bg-teal-900/30 rounded-lg border border-blue-200 dark:border-teal-800">
              <p className="text-blue-800 dark:text-teal-200 font-semibold text-sm">📝 Gợi ý cấu trúc:</p>
              <p className="text-blue-700 dark:text-teal-300 mt-1 text-sm">{gameState.syllableHint}</p>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0 space-y-6">
          {/* Bảng đoán chữ */}
          <div className="grid grid-cols-7 gap-1.5 md:gap-2 mb-6 justify-center place-items-center px-2">
            {gameState.board.map((row, rowIndex) =>
              row.map((_, colIndex) => (
                <div
                  key={`${rowIndex}-${colIndex}`}
                  className={`
                    md:w-12 w-11 md:h-12 h-11 border-2 flex items-center justify-center
                    text-lg font-bold uppercase transition-all duration-300
                    rounded-sm md:rounded-md shadow-sm dark:text-white
                    ${getTileColor(rowIndex, colIndex)}
                  `}
                >
                  {getDisplayLetter(rowIndex, colIndex)}
                </div>
              ))
            )}
          </div>

          {/* Bàn phím ảo */}
          <div className="space-y-2">
            {VIETNAMESE_KEYBOARD_ROWS.map((row, rowIndex) => (
              <div key={rowIndex} className="flex justify-center gap-1">
                {row.map((key) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    className={`
                      ${key === "ENTER" || key === "BACKSPACE" ? "px-3 text-xs" : "w-10 h-10 p-0"}
                      font-semibold transition-all duration-200 rounded-md shadow-sm
                      ${getKeyColor(key)}
                    `}
                    onClick={() => handleKeyPress(key)}
                    disabled={gameState.gameStatus !== "playing" || isCheckingWord}
                  >
                    {key === "BACKSPACE" ? "⌫" : key === "ENTER" ? "↵" : key}
                  </Button>
                ))}
              </div>
            ))}
          </div>

          {/* Chú thích ở dưới */}
          <div className="text-center text-sm pb-4 text-neutral-600 dark:text-neutral-400 space-y-2">
            <p className="font-medium">Đoán từ tiếng Việt gồm 7 chữ cái trong 6 lần thử!</p>
            <div className="flex justify-center items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <span className="inline-block w-4 h-4 bg-green-500 dark:bg-emerald-600 rounded"></span>
                <span>Đúng vị trí</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block w-4 h-4 bg-yellow-500 dark:bg-amber-500 rounded"></span>
                <span>Sai vị trí</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block w-4 h-4 bg-gray-500 dark:bg-neutral-500 rounded"></span>
                <span>Không có</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}