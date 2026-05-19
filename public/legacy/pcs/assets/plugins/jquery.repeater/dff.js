var room = 1;

function education_fields() {

    room++;
    var objTo = document.getElementById('education_fields')
    var divtest = document.createElement("div");
    divtest.setAttribute("class", "form-group removeclass" + room);
    var rdiv = 'removeclass' + room;
    divtest.innerHTML = '<div class="add-product-bill pt-3"> <div class="text-right text-danger font-weight-bold">item# ' + room + '</div><div class="row "> <div class="col-12 col-md-3"> <label class="form-control-label" for="transportType[]">ประเภทการขนส่ง</label> <div class="form-group"> <select id="transportType' + room + '" class="form-control" name="transportType[]" required> <option>กรุณาเลือก...</option> <option value="1">ขนส่งสินค้าทางรถ</option> <option value="2">ขนส่งสินค้าทางเรือ</option> </select> </div></div><div class="col-12 col-md-3"> <label class="form-control-label" for="productsType[]">ประเภทสินค้า</label> <div class="form-group"> <select id="productsType' + room + '" class="form-control" name="productsType[]" required> <option>กรุณาเลือก...</option> <option value="1">ทั่วไป</option> <option value="2">มอก.</option> <option value="2">อย.</option> <option value="2">พิเศษ</option> </select> </div></div><div class="col-12 col-md-6"> <label class="form-control-label" for="listProduct[]">รายการสินค้า</label> <div class="form-group"> <input type="text" class="form-control" name="listProduct[]" placeholder="รายการสินค้า" required=""> </div></div></div><div class="row"> <div class="col-12 col-md-2"> <label class="form-control-label" for="kgProduct[]">น้ำหนัก</label> <div class="form-group"> <input type="number" class="form-control" name="kgProduct[]" min="0" step="0.01" placeholder="น้ำหนัก (KG)"> </div></div><div class="col-12 col-md-7"> <div class="row"> <div class="col-sm-3"> <label class="form-control-label" for="width[]">ความกว้าง (cm.)</label> <input type="number" min="0" step="0.01" class="form-control" id="width' + room + '" name="width[]" placeholder="กว้าง (cm)"> </div><div class="col-sm-3"> <label class="form-control-label" for="length[]">ความยาว (cm.)</label> <input type="number" min="0" step="0.01" class="form-control" id="length' + room + '" name="length[]" placeholder="ยาว (cm)"> </div><div class="col-sm-3"> <label class="form-control-label" for="height[]">ความสูง (cm.)</label> <input type="number" min="0" step="0.01" class="form-control" id="height' + room + '" name="height[]" placeholder="สูง (cm)"> </div><div class="col-sm-3"> <label class="form-control-label" for="volume[]">ปริมาตร (CBM)</label> <input type="number" min="0" step="0.001" class="form-control" id="volume' + room + '" name="volume[]" placeholder="ปริมาตร (CBM)"> </div></div></div><div class="col-12 col-md-3"> <label class="form-control-label" for="amount[]">จำนวน</label> <div class="form-group"> <input type="number" min="0" step="1" class="form-control" name="amount[]" placeholder="จำนวนสินค้า"> </div></div></div><div class="header-from"></div></div><div class="text-right"><button class="btn btn-success" type="button" onclick="education_fields();"><i class="fa fa-plus"></i></button> <button class="btn btn-danger" type="button" onclick="remove_education_fields(' + room + ');"> <i class="fa fa-minus"></i> </button> </div>';

    objTo.appendChild(divtest)
    $(document).ready(function() {
        $('#transportType' + room + '').on("change", function() {
            if ($('#transportType' + room + '').val() == "2") {
                $('#productsType' + room + '').html('<option>กรุณาเลือก...</option><option value="1">ทั่วไป</option><option value="2">มอก.</option>');
            } else {
                $('#productsType' + room + '').html('<option>กรุณาเลือก...</option><option value="1">ทั่วไป</option><option value="2">มอก.</option><option value="2">อย.</option><option value="2">พิเศษ</option>');
            }
        });
        $('#height' + room + '').on("change keyup", function() {
            var volume = ($('#width' + room + '').val() * $('#length' + room + '').val() * $('#height' + room + '').val()) / 1000000;
            $('#volume' + room + '').val(volume.toFixed(3));
        });
        $('#width' + room + '').on("change keyup", function() {
            var volume = ($('#width' + room + '').val() * $('#length' + room + '').val() * $('#height' + room + '').val()) / 1000000;
            $('#volume' + room + '').val(volume.toFixed(3));
        });
        $('#length' + room + '').on("change keyup", function() {
            var volume = ($('#width' + room + '').val() * $('#length' + room + '').val() * $('#height' + room + '').val()) / 1000000;
            $('#volume' + room + '').val(volume.toFixed(3));
        });
        $('#volume' + room + '').focusout(function() {
            var volume = $('#volume' + room + '').val() * 1;
            $('#volume' + room + '').val(volume.toFixed(3));
        });
        $('#volume' + room + '').on("change", function() {
            var value = null;
            $('#width' + room + '').val(value);
            $('#length' + room + '').val(value);
            $('#height' + room + '').val(value);
        });
    });
}

function remove_education_fields(rid) {
    $('.removeclass' + rid).remove();
}