// 英文「依文法練習」的文法清單(2026-10-07 產生,勿手改;來源 data/rerender/kc-names/)
// 康軒知識點代碼 JEN0201xx(語法)由子代理依每個代碼的題目與詳解命名,
// Claude 用「詳解出現該文法關鍵詞的比例」驗證(≥50%),比例偏低的 4 個親讀題目確認;
// 只收 confidence=high 且選擇題 ≥ 5 題的細項(91 個收 58 個),題目雜或太少的不列出。
// count = 收錄當下該代碼的可見選擇題數(僅供顯示)。

export interface GrammarPoint { code: string; name: string; count: number }
export interface GrammarGroup { group: string; name: string; points: GrammarPoint[] }

export const ENGLISH_GRAMMAR: GrammarGroup[] = [
  {
    "group": "JEN020101",
    "name": "名詞、代名詞與冠詞",
    "points": [
      {
        "code": "JEN020101010000",
        "name": "名詞單複數與可數/不可數名詞",
        "count": 113
      },
      {
        "code": "JEN020101020000",
        "name": "天氣與時間的說法(It is… / There is…)",
        "count": 32
      },
      {
        "code": "JEN020101030000",
        "name": "名詞所有格('s / s')",
        "count": 26
      },
      {
        "code": "JEN020101040000",
        "name": "人稱代名詞與所有格(I / my / he / his)",
        "count": 166
      },
      {
        "code": "JEN020101050000",
        "name": "指示代名詞 this / that / these / those",
        "count": 23
      },
      {
        "code": "JEN020101060000",
        "name": "不定代名詞(one / ones / both / each / the other)",
        "count": 60
      },
      {
        "code": "JEN020101080000",
        "name": "所有格代名詞(mine / yours)",
        "count": 5
      },
      {
        "code": "JEN020101090000",
        "name": "反身代名詞(myself / -selves)",
        "count": 57
      },
      {
        "code": "JEN020101100000",
        "name": "冠詞 a / an / the",
        "count": 37
      }
    ]
  },
  {
    "group": "JEN020102",
    "name": "疑問詞問句",
    "points": [
      {
        "code": "JEN020102010000",
        "name": "疑問詞 Who / What / Which(問人、事物、選擇)",
        "count": 59
      },
      {
        "code": "JEN020102030000",
        "name": "疑問詞 Where / When(問地點、日期)",
        "count": 53
      },
      {
        "code": "JEN020102040000",
        "name": "What time 問幾點",
        "count": 12
      },
      {
        "code": "JEN020102050000",
        "name": "What day 問星期幾",
        "count": 11
      },
      {
        "code": "JEN020102060000",
        "name": "What's the date 問日期",
        "count": 6
      },
      {
        "code": "JEN020102070000",
        "name": "How many / How much 問數量",
        "count": 14
      },
      {
        "code": "JEN020102080000",
        "name": "How much 問價錢",
        "count": 6
      },
      {
        "code": "JEN020102100000",
        "name": "How often 問頻率",
        "count": 15
      },
      {
        "code": "JEN020102110000",
        "name": "How long 問多久(時間長度)",
        "count": 6
      }
    ]
  },
  {
    "group": "JEN020103",
    "name": "形容詞與比較級",
    "points": [
      {
        "code": "JEN020103030000",
        "name": "原級比較(as + 原級 + as)",
        "count": 21
      },
      {
        "code": "JEN020103040000",
        "name": "比較級(-er / more … than)",
        "count": 97
      },
      {
        "code": "JEN020103050000",
        "name": "最高級(the -est / the most)",
        "count": 57
      },
      {
        "code": "JEN020103060000",
        "name": "介系詞片語修飾名詞(with / in / about)",
        "count": 14
      },
      {
        "code": "JEN020103070000",
        "name": "序數與日期(first / second / 分數)",
        "count": 32
      }
    ]
  },
  {
    "group": "JEN020104",
    "name": "副詞",
    "points": [
      {
        "code": "JEN020104010000",
        "name": "時間副詞與頻率(last night / once a week)",
        "count": 65
      },
      {
        "code": "JEN020104030000",
        "name": "情狀副詞與形容詞的區分(-ly)",
        "count": 48
      },
      {
        "code": "JEN020104040000",
        "name": "頻率副詞(always / often / seldom / never)與位置",
        "count": 49
      },
      {
        "code": "JEN020104070000",
        "name": "副詞最高級(the best / the fastest of all)",
        "count": 5
      },
      {
        "code": "JEN020104090000",
        "name": "too + 形容詞 + to V(太……而不能)",
        "count": 6
      }
    ]
  },
  {
    "group": "JEN020105",
    "name": "介系詞",
    "points": [
      {
        "code": "JEN020105010000",
        "name": "地方介系詞(in / on / under / behind / next to)",
        "count": 70
      },
      {
        "code": "JEN020105020000",
        "name": "時間介系詞(at / on / in)",
        "count": 38
      }
    ]
  },
  {
    "group": "JEN020106",
    "name": "連接詞",
    "points": [
      {
        "code": "JEN020106010000",
        "name": "對等連接詞(and / but / or / so)",
        "count": 119
      },
      {
        "code": "JEN020106020000",
        "name": "從屬連接詞(because / when / before / after)",
        "count": 197
      }
    ]
  },
  {
    "group": "JEN020107",
    "name": "助動詞",
    "points": [
      {
        "code": "JEN020107010000",
        "name": "助動詞 do / does(問句、否定與簡答)",
        "count": 87
      },
      {
        "code": "JEN020107020000",
        "name": "助動詞 can / can’t",
        "count": 58
      },
      {
        "code": "JEN020107090000",
        "name": "used to + 原形動詞(過去習慣)",
        "count": 7
      }
    ]
  },
  {
    "group": "JEN020108",
    "name": "特殊動詞用法(動詞句型)",
    "points": [
      {
        "code": "JEN020108020000",
        "name": "連綴動詞(look / feel / smell / taste + 形容詞)",
        "count": 72
      },
      {
        "code": "JEN020108030000",
        "name": "感官動詞(see / hear / watch + 受詞 + V / V-ing)",
        "count": 88
      },
      {
        "code": "JEN020108040000",
        "name": "使役動詞(make / let / have + 受詞 + 原形動詞)",
        "count": 52
      },
      {
        "code": "JEN020108060000",
        "name": "花費動詞(spend / take / cost / pay)",
        "count": 64
      },
      {
        "code": "JEN020108070000",
        "name": "help + 受詞 + (to) 原形動詞",
        "count": 12
      },
      {
        "code": "JEN020108080000",
        "name": "授與動詞(give / buy + 人 + 物 = 物 + to / for + 人)",
        "count": 46
      }
    ]
  },
  {
    "group": "JEN020109",
    "name": "be 動詞",
    "points": [
      {
        "code": "JEN020109020000",
        "name": "be 動詞疑問句與簡答(Is / Are…? Yes, …is.)",
        "count": 87
      }
    ]
  },
  {
    "group": "JEN020110",
    "name": "過去簡單式",
    "points": [
      {
        "code": "JEN020110030000",
        "name": "過去簡單式(was / were、動詞過去式)",
        "count": 190
      }
    ]
  },
  {
    "group": "JEN020111",
    "name": "現在進行式",
    "points": [
      {
        "code": "JEN020111000000",
        "name": "現在進行式(am / is / are + V-ing)",
        "count": 55
      }
    ]
  },
  {
    "group": "JEN020112",
    "name": "過去進行式",
    "points": [
      {
        "code": "JEN020112000000",
        "name": "過去進行式(was / were + V-ing)",
        "count": 40
      }
    ]
  },
  {
    "group": "JEN020113",
    "name": "未來式",
    "points": [
      {
        "code": "JEN020113000000",
        "name": "未來式(will / be going to + 原形動詞)",
        "count": 86
      }
    ]
  },
  {
    "group": "JEN020114",
    "name": "現在完成式",
    "points": [
      {
        "code": "JEN020114000000",
        "name": "現在完成式(have / has + p.p.)",
        "count": 73
      }
    ]
  },
  {
    "group": "JEN020116",
    "name": "被動語態",
    "points": [
      {
        "code": "JEN020116000000",
        "name": "被動語態(be 動詞 + p.p.)",
        "count": 40
      }
    ]
  },
  {
    "group": "JEN020117",
    "name": "不定詞、動名詞與分詞形容詞",
    "points": [
      {
        "code": "JEN020117010000",
        "name": "不定詞(to V)用法(want to V、It is…to V)",
        "count": 100
      },
      {
        "code": "JEN020117020000",
        "name": "動名詞(V-ing)當主詞與受詞(enjoy / keep + V-ing)",
        "count": 86
      },
      {
        "code": "JEN020117030000",
        "name": "情緒形容詞 -ing / -ed(exciting / excited)",
        "count": 7
      }
    ]
  },
  {
    "group": "JEN020118",
    "name": "名詞子句",
    "points": [
      {
        "code": "JEN020118010000",
        "name": "間接問句(wh- 疑問詞 + 主詞 + 動詞)",
        "count": 57
      }
    ]
  },
  {
    "group": "JEN020119",
    "name": "關係代名詞(形容詞子句)",
    "points": [
      {
        "code": "JEN020119010000",
        "name": "關係代名詞 who / which / that(形容詞子句)",
        "count": 141
      },
      {
        "code": "JEN020119020000",
        "name": "關係代名詞所有格 whose",
        "count": 7
      }
    ]
  },
  {
    "group": "JEN020120",
    "name": "特殊句型",
    "points": [
      {
        "code": "JEN020120010000",
        "name": "There is / There are(有……)",
        "count": 79
      },
      {
        "code": "JEN020120020000",
        "name": "附加問句(…, isn’t it?)",
        "count": 7
      },
      {
        "code": "JEN020120030000",
        "name": "附和句(so / neither / too / either)",
        "count": 38
      },
      {
        "code": "JEN020120040000",
        "name": "祈使句與 Let’s(Don’t / Please / Let’s not)",
        "count": 95
      }
    ]
  }
];
