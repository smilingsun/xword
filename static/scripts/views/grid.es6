"use strict";

var $        = require('jquery');
var _        = require('lodash');
var Q        = require('q');
var Backbone = require('backbone');

const DIRECTIONS = {
	ACROSS: 1,
	DOWN: 2
};

const KEYCODES = {
	BACKSPACE: 8,
	TAB: 9,
	SPACE: 32,
	LEFT_ARROW: 37,
	UP_ARROW: 38,
	RIGHT_ARROW: 39,
	DOWN_ARROW: 40,
	DELETE: 46
};

var GridView = Backbone.View.extend({
	events: {
		'change .crossword-cell .letter-input': '_handleCrosswordCellChange',
		'click .crossword-cell': '_handleCrosswordCellClick',
		'dblclick .crossword-cell.highlighted': '_handleCrosswordCellDoubleClick',
		'keypress .crossword-cell': '_handleCrosswordCellKeypress',
		'keydown .crossword-cell': '_handleCrosswordCellKeydown',
		'focusin .crossword-cell .letter-input': '_handleCrosswordCellFocus'
	},

	initialize: function() {
		var view = this;

		Backbone.View.prototype.initialize.apply(view, arguments);
	},

	render: function() {
		var view = this;

		Backbone.View.prototype.render.apply(view, arguments);

		view._$grid = view.$('.crossword-grid');

		view._clueLists = {
			$across: view.$('.clues-list-across'),
			$down: view.$('.clues-list-down')
		};

		view._$directionIndicator = view.$('.direction-indicator');

		view._setDirection(DIRECTIONS.ACROSS);

		return view;
	},

	_getCurrentAnswers: function() {
		var view = this;

		var answers = _.map(
			view._$grid.find('.puzzle-row'),
			function(row) {
				return _.map(
					$(row).find('.cell'),
					function(cell) {
						var $cell = $(cell);

						if ($cell.hasClass('block-cell')) {
							return '#';
						}

						return $cell.find('.letter-input').val() || null;
					}
				);
			}
		);

		return answers;
	},

	_toggleDirection: function() {
		var view = this;

		view._setDirection(
			view.direction === DIRECTIONS.ACROSS ?
				DIRECTIONS.DOWN :
				DIRECTIONS.ACROSS
		);
	},

	_setDirection: function(direction) {
		var view = this;

		view.direction = direction;

		var clueNumber;
		var $focusedCell = view._$grid.find(':focus').closest('.crossword-cell');

		var $highlighted = view._$grid.add(view._clueLists.$across)
			.add(view._clueLists.$down)
			.find('.highlighted');

		if (view.direction === DIRECTIONS.ACROSS) {
			view._$directionIndicator.removeClass('down')
				.addClass('across');

			if ($focusedCell.length > 0) {
				clueNumber = $focusedCell.data('containing-clue-across');
			}

			if (!_.isUndefined(clueNumber)) {
				$highlighted.removeClass('highlighted');
				view._highlightAcrossClue(clueNumber);
			}
		}
		else if (view.direction === DIRECTIONS.DOWN) {
			view._$directionIndicator.removeClass('across')
				.addClass('down');

			if ($focusedCell.length > 0) {
				clueNumber = $focusedCell.data('containing-clue-down');
			}

			if (!_.isUndefined(clueNumber)) {
				$highlighted.removeClass('highlighted');
				view._highlightDownClue(clueNumber);
			}
		}
	},

	_goLeft: function($currentCell) {
		var view = this;

		return $currentCell.prevAll('.crossword-cell').first().find('.letter-input').focus();
	},

	_goRight: function($currentCell) {
		var view = this;

		return $currentCell.nextAll('.crossword-cell').first().find('.letter-input').focus();
	},

	_goUp: function($currentCell) {
		var view = this;

		return $currentCell.closest('.puzzle-row').prevAll().find(
			'.crossword-cell:nth-child(' + (
				$currentCell.index() + 1
			) + ')'
		).last().find('.letter-input').focus();
	},

	_goDown: function($currentCell) {
		var view = this;

		return $currentCell.closest('.puzzle-row').nextAll().find(
			'.crossword-cell:nth-child(' + (
				$currentCell.index() + 1
			) + ')'
		).first().find('.letter-input').focus();
	},

	_goToNextCell: function($currentCell) {
		var view = this;

		if (view.direction === DIRECTIONS.ACROSS) {
			return view._goRight($currentCell);
		}

		return view._goDown($currentCell);
	},

	_goToPreviousCell: function($currentCell) {
		var view = this;

		if (view.direction === DIRECTIONS.ACROSS) {
			return view._goLeft($currentCell);
		}

		return view._goUp($currentCell);
	},

	_highlightAcrossClue: function(number) {
		var view = this;

		view._clueLists.$across.find('[data-clue-number="' + number + '"]').addClass('highlighted');

		view._$grid.find('.crossword-cell[data-containing-clue-across="' + number + '"]')
			.addClass('highlighted');
	},

	_highlightDownClue: function(number) {
		var view = this;

		view._clueLists.$down.find('[data-clue-number="' + number + '"]')
			.addClass('highlighted');

		view._$grid.find('.crossword-cell[data-containing-clue-down="' + number + '"]')
			.addClass('highlighted');
	},

	_highlightClues: function(clues) {
		var view = this;

		view._$grid.add(view._clueLists.$across)
			.add(view._clueLists.$down).find('.highlighted').removeClass('highlighted');

		if (view.direction === DIRECTIONS.ACROSS) {
			view._highlightAcrossClue(clues.across);
		}
		else if (view.direction === DIRECTIONS.DOWN) {
			view._highlightDownClue(clues.down);
		}
	},

	_handleCrosswordCellChange: function(event) {
		var view = this;

		var $cell = $(event.currentTarget);

		$cell.val($cell.val().toLocaleUpperCase());
	},

	_handleCrosswordCellKeypress: function(event) {
		var view = this;

		view._goToNextCell($(event.currentTarget));
	},

	_handleCrosswordCellKeydown: function(event) {
		var view = this;
		var $currentCell = $(event.currentTarget);
		var $input = $currentCell.find('.letter-input');

		switch (event.which) {
			case KEYCODES.LEFT_ARROW:
				view._goLeft($currentCell);
				event.preventDefault();
				return;
			case KEYCODES.UP_ARROW:
				view._goUp($currentCell);
				event.preventDefault();
				return;
			case KEYCODES.RIGHT_ARROW:
				view._goRight($currentCell);
				event.preventDefault();
				return;
			case KEYCODES.DOWN_ARROW:
				view._goDown($currentCell);
				event.preventDefault();
				return;
			case KEYCODES.DELETE:
				$input.val('');
				return;
			case KEYCODES.TAB:
				view._goToNextCell($currentCell);
				event.preventDefault();
				return;
			case KEYCODES.SPACE:
				view._toggleDirection();
				event.preventDefault();
				return;
			case KEYCODES.BACKSPACE:
				if ($input.val() === '') {
					view._goToPreviousCell($currentCell).find('.letter-input').val('');
				}
				else {
					$input.val('');
				}
				return;
		}

		if (/[a-zA-Z]/.test(String.fromCharCode(event.which))) {
			// Holding SHIFT while typing will allow multiple letters (some puzzles
			// include multi-letter cells)
			if (!event.shiftKey) {
				// Make sure we replace with the typed text
				$input.val('');
			}
		}
		else {
			// Not an alphabetic character--reject it
			event.preventDefault();
		}
	},

	_handleCrosswordCellFocus: function(event) {
		var view = this;

		var $el = $(event.currentTarget);

		var $parentCell = $el.closest('.crossword-cell');

		var containingClues = {
			across: $parentCell.data('containing-clue-across'),
			down: $parentCell.data('containing-clue-down')
		};

		view._highlightClues(containingClues);
	},

	_handleCrosswordCellClick: function(event) {
		var view = this;

		$(event.currentTarget).find('.letter-input').focus();
	},

	_handleCrosswordCellDoubleClick: function(event) {
		var view = this;

		view._toggleDirection();
	},

	_handleClueClick: function(event) {
		var view = this;

		var $clue = $(event.currentTarget);

		var clueNumber = $clue.data('clue-number');
		var clueDirection = $clue.data('clue-direction');

		view._$grid.find('.crossword-cell[data-clue-number="' + clueNumber + '"]')
			.find('.letter-input').focus();

		view._setDirection(
			clueDirection === 'across' ?
				DIRECTIONS.ACROSS :
				DIRECTIONS.DOWN
		);
	}
});

GridView.KEYCODES = KEYCODES;

GridView.DIRECTIONS = DIRECTIONS;

exports = module.exports = GridView;
