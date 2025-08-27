listOfName = [];
totalCost = 0;
whoIsOwed = [];

function add_fields() {
    document.getElementById("myTable").insertRow(-1).innerHTML =
    '<tr>\
        <td>\
        <textarea name="Name" placeholder="Name" th:field="${questionAnswerSet.name}" id="name" style="resize: none; width: 100%;"></textarea>\
        </td>\
        <td>\
        <textarea name="Cost" placeholder="Cost" th:field="${questionAnswerSet.cost}" id="cost" style="resize: none; width: 100%;"></textarea>\
        </td>\
        <td>\
        <textarea name="Payed" placeholder="Payed" th:field="${questionAnswerSet.payed}" id="payed" style="resize: none; width: 100%;"></textarea>\
        </td>\
    </tr>'
}

function generate_summary() {
    //var y = document.getElementById("summaryList");
    //var x3 = document.createElement("H3");
    //x3.textContent = "Heading 3";
    //y.appendChild(x3);
    console.log(document.getElementById('name').value)
}

function getTextAreasString() {
    var textArray = []
    Array.from(document.getElementsByTagName("textarea")).forEach(
        textarea => textArray.push(textarea.textContent)
    )
    console.log(textArray)
    return textArray;
}
