var _loadResult = OS.env.loadLibrary('stdlib/UI Utils');
if (!_loadResult.success) {
  throw new Error('Failed to load UI library: ' + (_loadResult.error || 'Unknown'));
}

// ── State ────────────────────────────────────────────────────
var display = '0';
var accumulator = null;
var operator = null;
var waitingForOperand = false;

function inputDigit(d) {
  if (waitingForOperand) {
    display = d;
    waitingForOperand = false;
  } else {
    display = display === '0' ? d : display + d;
  }
}

function inputDot() {
  if (waitingForOperand) {
    display = '0.';
    waitingForOperand = false;
    return;
  }
  if (display.indexOf('.') === -1) {
    display = display + '.';
  }
}

function clearAll() {
  display = '0';
  accumulator = null;
  operator = null;
  waitingForOperand = false;
}

function toggleSign() {
  var n = parseFloat(display);
  display = String(-n);
}

function inputPercent() {
  var n = parseFloat(display);
  display = String(n / 100);
}

function calculate(left, right, op) {
  if (op === '+') return left + right;
  if (op === '-') return left - right;
  if (op === '×') return left * right;
  if (op === '÷') return right !== 0 ? left / right : 'Error';
  return right;
}

function handleOperator(nextOp) {
  var current = parseFloat(display);

  if (operator && !waitingForOperand) {
    var result = calculate(accumulator, current, operator);
    if (result === 'Error') {
      display = 'Error';
      accumulator = null;
      operator = null;
      waitingForOperand = true;
      return;
    }
    display = String(result);
    accumulator = result;
  } else {
    accumulator = current;
  }

  operator = nextOp;
  waitingForOperand = true;
}

function handleEquals() {
  if (!operator) return;
  var current = parseFloat(display);
  var result = calculate(accumulator, current, operator);
  if (result === 'Error') {
    display = 'Error';
  } else {
    display = String(result);
  }
  accumulator = null;
  operator = null;
  waitingForOperand = true;
}

function formatDisplay(val) {
  if (val === 'Error') return val;
  if (val.length > 14) return parseFloat(val).toPrecision(10);
  return val;
}

// ── Styles ───────────────────────────────────────────────────
var numBtn = {
  padding: '16px',
  borderRadius: '10px',
  fontSize: '18px',
  fontWeight: 'bold',
  background: 'rgba(255,255,255,0.07)',
  color: '#ecf4ff',
  flex: '1',
  textAlign: 'center',
};

var opBtn = {
  padding: '16px',
  borderRadius: '10px',
  fontSize: '18px',
  fontWeight: 'bold',
  background: 'rgba(103,184,255,0.15)',
  color: '#67b8ff',
  flex: '1',
  textAlign: 'center',
};

var funcBtn = {
  padding: '16px',
  borderRadius: '10px',
  fontSize: '16px',
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(216,232,255,0.7)',
  flex: '1',
  textAlign: 'center',
};

var equalsBtn = {
  padding: '16px',
  borderRadius: '10px',
  fontSize: '18px',
  fontWeight: 'bold',
  background: 'linear-gradient(135deg, #4a7fff, #67b8ff)',
  color: '#05101c',
  flex: '1',
  textAlign: 'center',
};

// ── Render ───────────────────────────────────────────────────
function makeBtn(label, style, handler) {
  return UI.button(label, { onClick: handler, style: style });
}

function getExpressionText() {
  if (accumulator === null) return '';
  return String(accumulator) + ' ' + (operator || '') + (waitingForOperand ? '' : '');
}

function updateDisplay(self) {
  self.patch('display', { text: formatDisplay(display) });
  self.patch('expression', { text: getExpressionText() });
}

var opBtnActive = {
  padding: '16px',
  borderRadius: '10px',
  fontSize: '18px',
  fontWeight: 'bold',
  background: 'rgba(103,184,255,0.45)',
  color: '#ffffff',
  flex: '1',
  textAlign: 'center',
  boxShadow: '0 0 8px rgba(103,184,255,0.4)',
};

function makeOpBtn(label, op, self) {
  return UI.button(label, {
    id: 'op-' + label,
    onClick: function () {
      handleOperator(op);
      updateDisplay(self);
      // 高亮當前運算符
      self.patch('op-÷', { style: op === '÷' ? opBtnActive : opBtn });
      self.patch('op-×', { style: op === '×' ? opBtnActive : opBtn });
      self.patch('op-−', { style: op === '-' ? opBtnActive : opBtn });
      self.patch('op-+', { style: op === '+' ? opBtnActive : opBtn });
    },
    style: opBtn,
  });
}

function clearOpHighlight(self) {
  self.patch('op-÷', { style: opBtn });
  self.patch('op-×', { style: opBtn });
  self.patch('op-−', { style: opBtn });
  self.patch('op-+', { style: opBtn });
}

var app = UI.createApp({
  title: '計算機',
  width: 340,
  height: 520,
  state: {},
  render: function (s, self) {
    function d(digit) {
      return function () { inputDigit(digit); updateDisplay(self); };
    }

    return UI.column([
      // Display
      UI.box([
        UI.text('', {
          fontSize: '13px',
          textAlign: 'right',
          color: 'rgba(216,232,255,0.45)',
          minHeight: '18px',
        }, 'expression'),
        UI.text(formatDisplay(display), {
          fontSize: '36px',
          fontWeight: '300',
          textAlign: 'right',
          color: '#ecf4ff',
          padding: '4px 4px 0',
          overflow: 'hidden',
        }, 'display'),
      ], {
        padding: '12px 16px',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        minHeight: '80px',
      }),

      // Row 1: C ± % ÷
      UI.row([
        makeBtn('C', funcBtn, function () { clearAll(); updateDisplay(self); clearOpHighlight(self); }),
        makeBtn('±', funcBtn, function () { toggleSign(); updateDisplay(self); }),
        makeBtn('%', funcBtn, function () { inputPercent(); updateDisplay(self); }),
        makeOpBtn('÷', '÷', self),
      ]),
      // Row 2: 7 8 9 ×
      UI.row([
        makeBtn('7', numBtn, d('7')),
        makeBtn('8', numBtn, d('8')),
        makeBtn('9', numBtn, d('9')),
        makeOpBtn('×', '×', self),
      ]),
      // Row 3: 4 5 6 -
      UI.row([
        makeBtn('4', numBtn, d('4')),
        makeBtn('5', numBtn, d('5')),
        makeBtn('6', numBtn, d('6')),
        makeOpBtn('−', '-', self),
      ]),
      // Row 4: 1 2 3 +
      UI.row([
        makeBtn('1', numBtn, d('1')),
        makeBtn('2', numBtn, d('2')),
        makeBtn('3', numBtn, d('3')),
        makeOpBtn('+', '+', self),
      ]),
      // Row 5: 0 . =
      UI.row([
        makeBtn('0', numBtn, d('0')),
        makeBtn('.', numBtn, function () { inputDot(); updateDisplay(self); }),
        makeBtn('=', equalsBtn, function () { handleEquals(); updateDisplay(self); clearOpHighlight(self); }),
      ]),
    ], { padding: '18px', gap: '8px' });
  },
});
