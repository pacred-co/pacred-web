if (window.history.replaceState) {
    window.history.replaceState(null, null, window.location.href);
}
function chkNumber(ele) {
    var vchar = String.fromCharCode(event.keyCode);
    if (vchar < '0' || vchar > '9') return false;
    ele.onKeyPress = vchar;
}

function chkNumber0(ele) {
    var vchar = String.fromCharCode(event.keyCode);
    if (vchar < '1' || vchar > '9') return false;
    ele.onKeyPress = vchar;
}

function chkNumberDot(ele) {
    var vchar = String.fromCharCode(event.keyCode);
    if ((vchar < '0' || vchar > '9') && (vchar != '.')) return false;
    ele.onKeyPress = vchar;
}
$('.tam-counter').each(function() {
    var $this = $(this),
        countTo = $this.attr('data-count');

    $({ countNum: $this.text() }).animate({ countNum: countTo }, {
        duration: 1000,
        easing: 'linear',
        step: function() {
            $this.text(Math.floor(this.countNum));
        },
        complete: function() {
            $this.text(addCommas(this.countNum));
            
                var countNum2 = countTo;
                $this.text(addCommas(countNum2));
            
        }
    });
});
function addCommas(nStr){
	nStr += '';
	x = nStr.split('.');
	x1 = x[0];
	x2 = x.length > 1 ? '.' + x[1] : '';
	var rgx = /(\d+)(\d{3})/;
	while (rgx.test(x1)) {
		x1 = x1.replace(rgx, '$1' + ',' + '$2');
	}
	return x1 + x2;
}

function decimalAdjust(type, value, exp) {
    // If the exp is undefined or zero...
    if (typeof exp === 'undefined' || +exp === 0) {
        return Math[type](value);
    }
    value = +value;
    exp = +exp;
    // If the value is not a number or the exp is not an integer...
    if (isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0)) {
        return NaN;
    }
    // Shift
    value = value.toString().split('e');
    value = Math[type](+(value[0] + 'e' + (value[1] ? (+value[1] - exp) : -exp)));
    // Shift back
    value = value.toString().split('e');
    return +(value[0] + 'e' + (value[1] ? (+value[1] + exp) : exp));
}

// Decimal floor
if (!Math.floor10) {
    Math.floor10 = function(value, exp) {
        return decimalAdjust('floor', value, exp);
    };
}

function currencyFormat(num) {
    return num.toFixed(2).replace(/(\d)(?=(\d{3})+\.)/g, "$1,");
}

function round(num, decimals) {
    var d = Math.pow(10, decimals);
    return Math.ceil(num * d) / d;
}

function formCheck() {
    var r = confirm("กรุณาตรวจสอบความถูกต้องก่อนทำรายการ");
    if (r == true) {
        $(document).ready(function() {
            $("#CheckWait").html("กำลังทำรายการ...");
            $("#CheckWait").attr("disabled", true);
        });
        return true;
    } else {
        return false;
    }
}

function parseDateString(dateString) {
    var matchers = [];
    matchers.push(/^[0-9]*$/.source);
    matchers.push(/([0-9]{1,2}\/){2}[0-9]{4}( [0-9]{1,2}(:[0-9]{2}){2})?/.source);
    matchers.push(/[0-9]{4}([\/\-][0-9]{1,2}){2}( [0-9]{1,2}(:[0-9]{2}){2})?/.source);
    matchers = new RegExp(matchers.join("|"));
    if (dateString instanceof Date) {
        return dateString;
    }
    if (String(dateString).match(matchers)) {
        if (String(dateString).match(/^[0-9]*$/)) {
            dateString = Number(dateString);
        }
        if (String(dateString).match(/\-/)) {
            dateString = String(dateString).replace(/\-/g, "/");
        }
        return new Date(dateString);
    } else {
        throw new Error("Couldn't cast `" + dateString + "` to a date object.");
    }
}

$("body").on("submit", "form", function() {
    $(this).submit(function() {
        return false;
    });
    $(".submit-wait").html('กำลังทำรายการ');
    return true;
});
// REMOVED 2026-05-27 — legacy auto-injected the Google Translate widget
// on every page that loaded tam-it.js, which produced the "ความต้นฉบับ /
// ให้คะแนนคำแปลนี้ / Google แปลภาษา" overlay floating at bottom-left of
// every protected screen. Pacred uses next-intl (own TH/EN switcher in
// NavBar) so the legacy GTranslate widget is redundant + visually noisy.
// Original code: `googleTranslateElementInit2()` + auto-script-inject of
// translate.google.com/translate_a/element.js + `GTranslateGetCurrentLang`,
// `GTranslateFireEvent`, `doGTranslate`. All neutered to no-ops below.
function googleTranslateElementInit2() { /* no-op (Pacred uses next-intl) */ }
function GTranslateGetCurrentLang() { return null; }
$(function() {
    "use strict";
    var url = window.location + "";
        var path = url.replace(window.location.protocol + "//" + window.location.host + "/", "");
        var element = $('ul#main-menu-navigation a').filter(function() {
            return this.href === url || this.href === path;// || url.href.indexOf(this.href) === 0;
        });
        element.parentsUntil(".main-menu-content").each(function (index){
            if($(this).is("li") && $(this).children("a").length !== 0)
            {
                $(this).children(".nav-item a").addClass("active");
                $(this).parent("ul#main-menu-navigation").length === 0
                    ? $(this).addClass("active")
                    : $(this).addClass("selected");
            } else if(!$(this).is("ul") && $(this).children(" a").length === 0) {
                $(this).addClass("selected");                
            }
            else if($(this).is("ul")){
                $(this).addClass('in');
            }
            
        });
    element.addClass("active"); 
    $('#main-menu-navigation a').on('click', function (e) {
        if (!$(this).hasClass("active")) {
            // hide any open menus and remove all other classes
            $("ul", $(this).parents("ul:first")).removeClass("in");
            $("a", $(this).parents("ul:first")).removeClass("active");
            
            // open our new menu and add the open class
            $(this).next("ul").addClass("in");
            $(this).addClass("active");
            
        }else if ($(this).hasClass("active")) {
            $(this).removeClass("active");
            $(this).parents("ul:first").removeClass("active");
            $(this).next("ul").removeClass("in");
        }
    })
    $('#main-menu-navigation >li >a.has-arrow').on('click', function (e) {
        e.preventDefault();
    });            
});
$(function(){ 
    "use strict";
    var url = window.location + "";
        var path = url.replace(window.location.protocol + "//" + window.location.host + "/", "");
        var element = $('.nav-footer-pcs a').filter(function() {
            return this.href === url || this.href === path;// || url.href.indexOf(this.href) === 0;
        });
        element.parentsUntil(".nav-footer-pcs").each(function (index)
        {
            if($(this).is("a") && $(this).children("a").length !== 0)
            {
                $(this).children("a").addClass("nav__link--active");
            }
            else if(!$(this).is("ul") && $(this).children(" a").length === 0)
            {
                $(this).addClass("selected");
                
            }
            else if($(this).is("ul")){
                $(this).addClass('in');
            }
            
        });
    element.addClass("nav__link--active");
});
// REMOVED 2026-05-27 — legacy GTranslate helpers paired with the auto-
// injected Google Translate widget (see neutered block higher up).
// Pacred uses next-intl, so these are no-ops. Any legacy markup that
// still calls onclick="doGTranslate('th|en')" will silently no-op
// instead of triggering the Google widget.
function GTranslateFireEvent(_element, _event) { /* no-op (Pacred uses next-intl) */ }
function doGTranslate(_lang_pair) { /* no-op (Pacred uses next-intl) */ }