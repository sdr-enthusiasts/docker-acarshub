$(document).ready(function(){
    generate_menu();
    generate_footer();

    var converter = new showdown.Converter();
    fetch('http://' + document.domain + ':' + location.port + '/aboutmd')
      .then(response => response.text())
      .then((data) => {
        $('#log').html(converter.makeHtml(data));
      })
});